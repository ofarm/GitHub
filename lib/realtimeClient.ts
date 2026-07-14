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

// 音声の取得元。mic=マイク（getUserMedia） / display=タブ音声（getDisplayMedia）。
export type AudioSource = "mic" | "display";

export type RealtimeSessionOptions = {
  // 既定 "mic"。
  source?: AudioSource;
  // "display" のとき: getDisplayMedia はユーザー操作起点の呼び出しが必須のため、
  // 呼び出し側（Start ボタンの click ハンドラ内）で取得済みの MediaStream を渡す想定。
  // RealtimeSession 自身は getDisplayMedia を呼ばない（自動再接続時に再取得できないため）。
  stream?: MediaStream;
};

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
  | "reconnecting"
  | "stopping"
  | "error";

// 自動再接続の設定（瞬断からの復帰用）。字幕は保持したまま接続だけ張り直す。
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_BACKOFF_MS = [2000, 4000, 8000];

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

// セッション最大長（OpenAI Realtime は現行60分）到達による明示終了を検知する純粋関数。
// ⚠️verify: 正確な error.code 文字列は実 wire で未確認。"session_expired" を含む値を広めに拾う。
// 検知できなくても connectionstatechange の失敗検知（CONNECTION_LOST）が最終的に効くため、
// 本検知は「より早く・より正確な理由で」再接続を開始するための先回り検知（無くても機能は保たれる）。
export function isSessionExpiredEvent(evt: unknown): boolean {
  if (!evt || typeof evt !== "object") return false;
  const o = evt as Record<string, unknown>;
  if (o.type !== "error") return false;
  const err = o.error;
  if (!err || typeof err !== "object") return false;
  const code = (err as Record<string, unknown>).code;
  return typeof code === "string" && code.includes("session_expired");
}

export class RealtimeSession {
  private pc: RTCPeerConnection | null = null;
  private stream: MediaStream | null = null;
  private dc: RTCDataChannel | null = null;
  private cb: RealtimeCallbacks;
  private statsTimer: number | null = null;
  // 再接続の管理。手動 Stop 時は再接続を一切行わない。
  private manualStop = false;
  private isReconnecting = false;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  // 1回の接続試行につき、失敗ハンドラの多重発火を防ぐガード。
  private failureHandled = false;
  // 音声の取得元と、"display" 用に呼び出し側で取得済みのストリーム。
  private source: AudioSource;
  private providedStream: MediaStream | null;

  constructor(cb: RealtimeCallbacks, opts?: RealtimeSessionOptions) {
    this.cb = cb;
    this.source = opts?.source ?? "mic";
    this.providedStream = opts?.stream ?? null;
  }

  private setState(s: RealtimeState) {
    this.cb.onStateChange?.(s);
  }

  async start(): Promise<void> {
    this.manualStop = false;
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    await this.connectOnce(false);
  }

  // 接続確立の1回分。isRetry=true の場合は再接続試行中であり、
  // state を "reconnecting" のまま維持する（"requesting"/"connecting" に戻さない）。
  private async connectOnce(isRetry: boolean): Promise<void> {
    this.failureHandled = false;
    try {
      if (!isRetry) this.setState("requesting");
      // 1) 自サーバから短命 client secret を取得（cookie 認証付き）。
      const res = await fetch("/api/realtime/client-secret", { method: "POST" });
      if (this.manualStop) return;
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
        this.handleAttemptFailure(upstream ? `${code} (上流:${upstream})` : code);
        return;
      }
      const { clientSecret } = (await res.json()) as { clientSecret: string };
      if (this.manualStop) return;

      // 2) 音声ストリームを用意する。
      // - mic: 会議などの周囲音声を拾いやすくするため、エコー除去/ノイズ抑制/自動ゲインを無効化。
      //   （スピーカーから出る相手の声を拾う用途。ヘッドホン利用時は別途システム音声取込が必要）
      //   getUserMedia はユーザー操作起点不要のため、再接続のたびに取得し直してよい。
      // - display: getDisplayMedia はユーザー操作起点必須のため、呼び出し側が Start 操作の中で
      //   取得済みのストリームを constructor 経由で渡す想定。再接続(isRetry)時は絶対に
      //   取得し直さず、既存ストリームを再利用する。トラックが既に終了していれば
      //   再接続を諦めて通常のエラー経路（fail）に倒す。
      if (!isRetry) this.setState("connecting");
      let stream: MediaStream;
      if (this.source === "display") {
        const existing = isRetry ? this.stream : this.providedStream;
        if (!existing) {
          this.handleAttemptFailure("START_FAILED");
          return;
        }
        const audioTrack = existing.getAudioTracks()[0];
        if (!audioTrack || audioTrack.readyState === "ended") {
          // タブ音声共有が既に終了している。再接続不可のため通常の Stop 相当で終了する。
          this.fail("DISPLAY_SHARE_ENDED");
          return;
        }
        if (!isRetry) {
          audioTrack.addEventListener("ended", () => this.handleDisplayTrackEnded());
        }
        stream = existing;
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
      }
      if (this.manualStop) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      this.stream = stream;

      // 3) PeerConnection 構築。音声 sender を控えて送信レベルを計測する。
      const pc = new RTCPeerConnection();
      if (this.manualStop) {
        pc.close();
        return;
      }
      this.pc = pc;
      let audioSender: RTCRtpSender | null = null;
      // display ソースは video トラックを保持だけして送信しない（停止すると共有全体が終わりうるため）。
      const tracksToSend =
        this.source === "display" ? this.stream.getAudioTracks() : this.stream.getTracks();
      for (const track of tracksToSend) {
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
        if (this.dc !== dc) return;
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
        if (this.pc !== pc) return;
        this.cb.onDiag?.("remoteTrack", `received:${e.track.kind}`);
        if (e.streams && e.streams[0]) this.cb.onRemoteStream?.(e.streams[0]);
      });

      pc.addEventListener("iceconnectionstatechange", () => {
        if (this.pc !== pc) return;
        this.cb.onDiag?.("ice", pc.iceConnectionState);
        if (pc.iceConnectionState === "failed") {
          this.handleAttemptFailure("CONNECTION_LOST");
        }
      });

      pc.addEventListener("connectionstatechange", () => {
        if (this.pc !== pc) return;
        this.cb.onDiag?.("conn", pc.connectionState);
        if (pc.connectionState === "connected") {
          this.isReconnecting = false;
          this.reconnectAttempts = 0;
          this.setState("live");
        }
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          this.handleAttemptFailure("CONNECTION_LOST");
        }
      });

      // 5) SDP 交換。
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (this.manualStop) return;

      const sdpRes = await fetch(REALTIME_BASE_URL, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${clientSecret}`,
          "Content-Type": "application/sdp",
        },
      });
      if (this.manualStop) return;
      if (!sdpRes.ok) {
        this.handleAttemptFailure(`SDP_EXCHANGE_FAILED (${sdpRes.status})`);
        return;
      }
      const answer = { type: "answer" as const, sdp: await sdpRes.text() };
      await pc.setRemoteDescription(answer);
      // connectionstatechange で live に遷移。
    } catch {
      // 例外本文をログしない（種別のみ）。
      if (!this.manualStop) this.handleAttemptFailure("START_FAILED");
    }
  }

  // 接続試行の失敗を一元処理する。
  // - 既にライブ経験がある切断(CONNECTION_LOST)、または既に再接続シーケンス中の失敗は再接続対象。
  // - それ以外（初回接続時の認証/SDPエラー等）は即座にエラー表示（既存挙動を維持）。
  private handleAttemptFailure(code: string): void {
    if (this.manualStop || this.failureHandled) return;
    this.failureHandled = true;
    const retryEligible =
      this.isReconnecting || code === "CONNECTION_LOST" || code === "SESSION_EXPIRED";
    if (retryEligible) {
      this.scheduleReconnect(code);
    } else {
      this.fail(code);
    }
  }

  // タブ音声共有が終了した（ユーザーがブラウザ UI で共有停止）。getDisplayMedia は
  // ユーザー操作起点が必須で再接続時に取得し直せないため、再接続は試みず
  // 手動 Stop 相当の後片付けをしてエラー表示する。
  private handleDisplayTrackEnded(): void {
    if (this.manualStop) return;
    this.fail("DISPLAY_SHARE_ENDED");
  }

  // 再接続をスケジュールする。上限に達していれば最終的なエラー表示にフォールバックする。
  private scheduleReconnect(finalCodeIfExhausted: string): void {
    // display ソースはストリーム(video含む)を保持したまま接続だけ張り直す。
    // getDisplayMedia を再度呼ぶとユーザー操作起点が必要になり自動再接続できないため。
    this.teardownConnection({ keepStream: this.source === "display" });
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.isReconnecting = false;
      this.fail(finalCodeIfExhausted);
      return;
    }
    this.reconnectAttempts += 1;
    const attempt = this.reconnectAttempts;
    this.isReconnecting = true;
    this.setState("reconnecting");
    this.cb.onDiag?.("reconnect", `attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS}`);
    const delay = RECONNECT_BACKOFF_MS[attempt - 1] ?? RECONNECT_BACKOFF_MS[RECONNECT_BACKOFF_MS.length - 1];
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.manualStop) return;
      this.connectOnce(true);
    }, delay);
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
    if (isSessionExpiredEvent(evt)) {
      // セッション最大長に到達。接続が切れる前に先回りして再接続を開始する（字幕は保持）。
      this.handleAttemptFailure("SESSION_EXPIRED");
      return;
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

  // 現在の接続（PeerConnection/DataChannel/マイク or タブ音声ストリーム）を閉じる。
  // state 遷移は行わない（再接続時は "reconnecting" を維持するため）。
  // keepStream=true の場合はストリームを止めずに保持する
  // （display ソースの再接続用: getDisplayMedia を取得し直せないため）。
  private teardownConnection(opts: { keepStream?: boolean } = {}): void {
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
    if (!opts.keepStream) {
      if (this.stream) {
        for (const track of this.stream.getTracks()) track.stop();
      }
      this.stream = null;
      // 早期失敗（this.stream への代入前、例: client secret 取得失敗）の場合でも、
      // 呼び出し側から渡されたタブ共有ストリームを確実に解放する
      // （解放しないとブラウザの「共有中」バーが残り続ける）。track.stop() は冪等。
      if (this.providedStream) {
        for (const track of this.providedStream.getTracks()) track.stop();
        this.providedStream = null;
      }
    }
    this.dc = null;
    this.pc = null;
  }

  // 接続とマイクを確実に解放する（Stop / unload から呼ぶ）。以降の自動再接続も停止する。
  stop(): void {
    this.manualStop = true;
    this.isReconnecting = false;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.setState("stopping");
    this.teardownConnection();
    this.setState("idle");
  }
}
