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
};

export type RealtimeState =
  | "idle"
  | "requesting"
  | "connecting"
  | "live"
  | "stopping"
  | "error";

// ⚠️ verify: 実接続先。新仕様では /v1/realtime/calls 等の可能性あり。env で上書き可。
const REALTIME_BASE_URL =
  process.env.NEXT_PUBLIC_REALTIME_BASE_URL ?? "https://api.openai.com/v1/realtime/calls";

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
        const code = res.status === 401 ? "AUTH_REQUIRED" : res.status === 403 ? "NOT_ALLOWED" : res.status === 429 ? "RATE_LIMITED" : "SECRET_FETCH_FAILED";
        this.fail(code);
        return;
      }
      const { clientSecret, model } = (await res.json()) as { clientSecret: string; model: string };

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

      pc.addEventListener("connectionstatechange", () => {
        if (pc.connectionState === "connected") this.setState("live");
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          this.fail("CONNECTION_LOST");
        }
      });

      // 5) SDP 交換。
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch(`${REALTIME_BASE_URL}?model=${encodeURIComponent(model)}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${clientSecret}`,
          "Content-Type": "application/sdp",
        },
      });
      if (!sdpRes.ok) {
        this.fail("SDP_EXCHANGE_FAILED");
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
  // ⚠️ verify: event.type の正確な名称は最新ドキュメントで確認。複数候補に防御的対応。
  private handleEvent(e: MessageEvent) {
    let evt: unknown;
    try {
      evt = JSON.parse(typeof e.data === "string" ? e.data : "");
    } catch {
      return; // 本文をログせず黙って無視。
    }
    if (!evt || typeof evt !== "object") return;
    const o = evt as Record<string, unknown>;
    const type = typeof o.type === "string" ? o.type : "";
    // 翻訳/文字起こしの増分テキストを拾う（候補に防御的対応）。
    if (type.endsWith(".delta") && typeof o.delta === "string") {
      this.cb.onDelta(o.delta);
    } else if (type.endsWith(".delta") && o.delta && typeof o.delta === "object") {
      const text = (o.delta as Record<string, unknown>).text;
      if (typeof text === "string") this.cb.onDelta(text);
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
