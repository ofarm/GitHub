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

export type RealtimeCallbacks = {
  onDelta: (text: string) => void; // 翻訳テキストの増分
  onStateChange?: (state: RealtimeState) => void;
  onError?: (code: string) => void;
  // 診断用: 受信イベントの「種別名」と「キー名」のみ（値=本文は渡さない）。
  onEvent?: (info: { type: string; keys: string[] }) => void;
  // 翻訳音声の再生用に、受信したリモート音声ストリームを渡す。
  onRemoteStream?: (stream: MediaStream) => void;
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

// サーバーイベントから翻訳テキストの増分のみを抽出する純粋関数（テスト可能）。
// ⚠️ verify: event.type の正確な名称は最新ドキュメントで確認。複数候補に防御的対応。
// 戻り値が null の場合は「翻訳増分ではない」イベント（無視する）。
export function extractDeltaText(evt: unknown): string | null {
  if (!evt || typeof evt !== "object") return null;
  const o = evt as Record<string, unknown>;
  const type = typeof o.type === "string" ? o.type : "";
  if (!type.endsWith(".delta")) return null;
  if (typeof o.delta === "string") return o.delta;
  if (o.delta && typeof o.delta === "object") {
    const text = (o.delta as Record<string, unknown>).text;
    if (typeof text === "string") return text;
  }
  return null;
}

export class RealtimeSession {
  private pc: RTCPeerConnection | null = null;
  private stream: MediaStream | null = null;
  private dc: RTCDataChannel | null = null;
  private cb: RealtimeCallbacks;

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
      this.setState("connecting");
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // 3) PeerConnection 構築。
      const pc = new RTCPeerConnection();
      this.pc = pc;
      for (const track of this.stream.getTracks()) {
        pc.addTrack(track, this.stream);
      }

      // 4) data channel（サーバーイベント受信）。
      const dc = pc.createDataChannel("oai-events");
      this.dc = dc;
      dc.addEventListener("message", (e) => this.handleEvent(e));
      // 接続確立後に session.update を明示送信して transcript 配信を有効化する。
      // （client_secret 側で設定済みでも、明示更新で transcript イベントが流れ出すことがある）
      dc.addEventListener("open", () => {
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
        if (e.streams && e.streams[0]) this.cb.onRemoteStream?.(e.streams[0]);
      });

      pc.addEventListener("connectionstatechange", () => {
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

  // サーバーイベントを解釈し、翻訳テキストの増分のみ抽出する。
  private handleEvent(e: MessageEvent) {
    let evt: unknown;
    try {
      evt = JSON.parse(typeof e.data === "string" ? e.data : "");
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
    const text = extractDeltaText(evt);
    if (text !== null) this.cb.onDelta(text);
  }

  private fail(code: string) {
    this.cb.onError?.(code);
    this.setState("error");
    this.stop();
  }

  // 接続とマイクを確実に解放する（Stop / unload から呼ぶ）。
  stop(): void {
    this.setState("stopping");
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
