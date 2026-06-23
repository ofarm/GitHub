// ブラウザ側の WebRTC 接続ライフサイクル。
// フロー: 自サーバから ek_ を取得 → getUserMedia → RTCPeerConnection → SDP 交換 →
//        data channel で日本語 delta を受信 → onDelta コールバックへ。
//
// 非交渉制約:
//  - 翻訳本文(delta)を console.log / storage に出さない。onDelta でメモリ表示のみ。
//  - 標準 API キーは扱わない（ek_ のみ）。
//
// ⚠️ verify: SDP 送信先 URL とサーバーイベントの正確な type 名は最新公式ドキュメントで要確認。
//    env: NEXT_PUBLIC_REALTIME_BASE_URL で上書き可能（秘密情報ではない接続先のみ）。

// 字幕の種別: source=英語原文 / translation=日本語訳。
export type DeltaKind = "source" | "translation";

export type RealtimeCallbacks = {
  onDelta: (kind: DeltaKind, text: string) => void; // 字幕テキストの増分（種別付き）
  onStateChange?: (state: RealtimeState) => void;
  onError?: (code: string) => void;
  // 診断用: 受信イベントの「種別名」と「キー名」のみ（値=本文は渡さない）。
  onEvent?: (info: { type: string; keys: string[] }) => void;
  // 翻訳音声の再生用に、受信したリモート音声ストリームを渡す。
  onRemoteStream?: (stream: MediaStream) => void;
  // 診断用: 接続状態など（label/value のメタ情報のみ）。
  onDiag?: (label: string, value: string) => void;
};

export type RealtimeState =
  | "idle"
  | "requesting"
  | "connecting"
  | "live"
  | "stopping"
  | "error";

// translate 専用の SDP 交換エンドポイント。model は ek_(client secret) に束縛されるため
// クエリ ?model= は付けない（付けると 400 になる既知事象あり）。env で上書き可。
const REALTIME_BASE_URL =
  process.env.NEXT_PUBLIC_REALTIME_BASE_URL ??
  "https://api.openai.com/v1/realtime/translations/calls";

// サーバーイベントから字幕テキストの増分を、種別付きで抽出する純粋関数（テスト可能）。
// - session.input_transcript.delta / input_audio_transcription → source（英語原文）
// - session.output_transcript.delta / (output_)audio_transcript → translation（日本語訳）
// 戻り値が null の場合は「字幕増分ではない」イベント（無視する）。
export function extractDelta(evt: unknown): { kind: DeltaKind; text: string } | null {
  if (!evt || typeof evt !== "object") return null;
  const o = evt as Record<string, unknown>;
  const type = typeof o.type === "string" ? o.type : "";
  if (!type.endsWith(".delta")) return null;

  let text: string | null = null;
  if (typeof o.delta === "string") text = o.delta;
  else if (o.delta && typeof o.delta === "object") {
    const t = (o.delta as Record<string, unknown>).text;
    if (typeof t === "string") text = t;
  }
  if (text === null) return null;

  const isSource = type.includes("input_transcript") || type.includes("input_audio_transcription");
  return { kind: isSource ? "source" : "translation", text };
}

export class RealtimeSession {
  private pc: RTCPeerConnection | null = null;
  private stream: MediaStream | null = null;
  private dc: RTCDataChannel | null = null;
  private cb: RealtimeCallbacks;
  private statsTimer: number | null = null;

  constructor(cb: RealtimeCallbacks) {
    this.cb = cb;
  }

  private setState(s: RealtimeState) {
    this.cb.onStateChange?.(s);
  }

  async start(): Promise<void> {
    try {
      this.setState("requesting");
      // 1) 自サーバから短命 client secret を取得（cookie 認証付き）。
      const res = await fetch("/api/realtime/client-secret", { method: "POST" });
      if (!res.ok) {
        // サーバーの正規化エラーコードをそのまま前面化（本文は含まない）。
        let code = "SECRET_FETCH_FAILED";
        let upstream = "";
        try {
          const body = (await res.json()) as { error?: string; upstreamStatus?: number };
          if (body.error) code = body.error;
          if (body.upstreamStatus) upstream = String(body.upstreamStatus);
        } catch {
          /* 本文を読めない場合はコードのみ */
        }
        this.fail(upstream ? `${code} (上流:${upstream})` : code);
        return;
      }
      const { clientSecret } = (await res.json()) as { clientSecret: string };

      // 2) マイク取得（ユーザー操作起点で呼ばれる前提 / iOS Safari 対応）。
      // 会議などの周囲音声を拾いやすくするため、エコー除去/ノイズ抑制/自動ゲインを無効化。
      // （スピーカーから出る相手の声を拾う用途。ヘッドホン利用時は別途システム音声取込が必要）
      this.setState("connecting");
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });

      // 3) PeerConnection 構築。音声 sender を控えて送信レベルを計測する。
      const pc = new RTCPeerConnection();
      this.pc = pc;
      let audioSender: RTCRtpSender | null = null;
      for (const track of this.stream.getTracks()) {
        const sender = pc.addTrack(track, this.stream);
        if (track.kind === "audio") audioSender = sender;
      }
      // 実際に WebRTC で送信中の音声レベルを計測（OpenAI に音声が届いているかの正解値）。
      this.startLevelMeter(audioSender, this.stream);

      // 4) data channel（サーバーイベント受信）。
      const dc = pc.createDataChannel("oai-events");
      this.dc = dc;
      dc.addEventListener("message", (e) => this.handleMessage(e.data));
      // サーバー側が別の data channel を開く場合にも対応（モデル出力イベント取りこぼし防止）。
      pc.addEventListener("datachannel", (e) => {
        e.channel.addEventListener("message", (ev) => this.handleMessage(ev.data));
      });
      // 接続確立後に session.update を明示送信して transcript 配信を有効化する。
      // （client_secret 側で設定済みでも、明示更新で transcript イベントが流れ出すことがある）
      dc.addEventListener("open", () => {
        this.cb.onDiag?.("dataChannel", "open");
        try {
          dc.send(
            JSON.stringify({
              type: "session.update",
              session: {
                audio: { input: { transcription: { model: "gpt-realtime-whisper" } } },
              },
            }),
          );
        } catch {
          /* noop */
        }
      });

      // 翻訳音声のリモートトラックを受け取り、再生用に渡す。
      pc.addEventListener("track", (e) => {
        this.cb.onDiag?.("remoteTrack", `received:${e.track.kind}`);
        if (e.streams && e.streams[0]) this.cb.onRemoteStream?.(e.streams[0]);
      });

      pc.addEventListener("iceconnectionstatechange", () => {
        this.cb.onDiag?.("ice", pc.iceConnectionState);
      });

      pc.addEventListener("connectionstatechange", () => {
        this.cb.onDiag?.("conn", pc.connectionState);
        if (pc.connectionState === "connected") this.setState("live");
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          this.fail("CONNECTION_LOST");
        }
      });

      // 5) SDP 交換。
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch(REALTIME_BASE_URL, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${clientSecret}`,
          "Content-Type": "application/sdp",
        },
      });
      if (!sdpRes.ok) {
        this.fail(`SDP_EXCHANGE_FAILED (${sdpRes.status})`);
        return;
      }
      const answer = { type: "answer" as const, sdp: await sdpRes.text() };
      await pc.setRemoteDescription(answer);
      // connectionstatechange で live に遷移。
    } catch {
      // 例外本文をログしない（種別のみ）。
      this.fail("START_FAILED");
    }
  }

  // data channel メッセージは string / Blob / ArrayBuffer のいずれでも届きうる。
  // 文字列以外で捨てると transcript を取りこぼすため、全形式を JSON 文字列へ正規化する。
  private handleMessage(data: unknown) {
    if (typeof data === "string") {
      this.processEventString(data);
    } else if (typeof Blob !== "undefined" && data instanceof Blob) {
      data
        .text()
        .then((t) => this.processEventString(t))
        .catch(() => {
          /* noop */
        });
    } else if (data instanceof ArrayBuffer) {
      try {
        this.processEventString(new TextDecoder().decode(data));
      } catch {
        /* noop */
      }
    }
  }

  // JSON 文字列を解釈し、翻訳テキストの増分のみ抽出する。
  private processEventString(s: string) {
    let evt: unknown;
    try {
      evt = JSON.parse(s);
    } catch {
      return; // 本文をログせず黙って無視。
    }
    // 診断: 種別名とキー名のみ通知（値は渡さない）。
    if (evt && typeof evt === "object") {
      const o = evt as Record<string, unknown>;
      this.cb.onEvent?.({
        type: typeof o.type === "string" ? o.type : "(no type)",
        keys: Object.keys(o),
      });
    }
    const d = extractDelta(evt);
    if (d !== null) this.cb.onDelta(d.kind, d.text);
  }

  // 送信中の音声レベルを RTCRtpSender.getStats() の audioLevel から計測する。
  // これは「実際に OpenAI へ送られている音声」のレベルなので、AudioContext の
  // suspended 等に左右されない。0付近のまま=無音が送られている（マイク選択の問題）。
  private startLevelMeter(sender: RTCRtpSender | null, stream: MediaStream) {
    // どのマイクデバイスが選ばれ、トラックが有効/ミュートかを診断表示。
    const track = stream.getAudioTracks()[0];
    if (track) {
      this.cb.onDiag?.(
        "micTrack",
        `${track.label || "mic"} enabled:${track.enabled} muted:${track.muted}`,
      );
      track.addEventListener("mute", () => this.cb.onDiag?.("micTrackState", "muted"));
      track.addEventListener("unmute", () => this.cb.onDiag?.("micTrackState", "unmuted"));
    }
    if (!sender) return;
    this.statsTimer = window.setInterval(async () => {
      try {
        const stats = await sender.getStats();
        let level: number | undefined;
        stats.forEach((r) => {
          const a = r as unknown as { type: string; kind?: string; audioLevel?: number };
          if (a.type === "media-source" && a.kind === "audio" && typeof a.audioLevel === "number") {
            level = a.audioLevel;
          }
        });
        if (typeof level === "number") {
          this.cb.onDiag?.("micLevel", String(Math.round(level * 1000)));
        }
      } catch {
        /* noop */
      }
    }, 400);
  }

  private stopLevelMeter() {
    if (this.statsTimer !== null) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
  }

  private fail(code: string) {
    this.cb.onError?.(code);
    this.setState("error");
    this.stop();
  }

  // 接続とマイクを確実に解放する（Stop / unload から呼ぶ）。
  stop(): void {
    this.setState("stopping");
    this.stopLevelMeter();
    try {
      this.dc?.close();
    } catch {
      /* noop */
    }
    try {
      this.pc?.close();
    } catch {
      /* noop */
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
    }
    this.dc = null;
    this.pc = null;
    this.stream = null;
    this.setState("idle");
  }
}
