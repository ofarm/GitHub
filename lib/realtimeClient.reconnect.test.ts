import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealtimeSession } from "./realtimeClient";

// vitest の node 環境には window が無いため、setTimeout 系呼び出し用に最小限のエイリアスを張る。
type Listener = (ev: unknown) => void;

class FakeEventTarget {
  private listeners = new Map<string, Set<Listener>>();
  addEventListener(type: string, cb: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
  }
  removeEventListener(type: string, cb: Listener) {
    this.listeners.get(type)?.delete(cb);
  }
  dispatchEvent(type: string, ev: unknown = {}) {
    this.listeners.get(type)?.forEach((cb) => cb(ev));
  }
}

class FakeTrack {
  kind = "audio";
  label = "fake-mic";
  enabled = true;
  muted = false;
  addEventListener() {
    /* noop */
  }
  stop = vi.fn();
}

class FakeStream {
  private tracks = [new FakeTrack()];
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks;
  }
}

class FakeDataChannel extends FakeEventTarget {
  close = vi.fn();
  send = vi.fn();
}

let peerConnections: FakePeerConnection[] = [];

class FakePeerConnection extends FakeEventTarget {
  connectionState = "new";
  iceConnectionState = "new";
  closed = false;

  constructor() {
    super();
    peerConnections.push(this);
  }

  addTrack = vi.fn(() => ({}) as unknown as RTCRtpSender);
  createDataChannel = vi.fn(() => new FakeDataChannel() as unknown as RTCDataChannel);
  createOffer = vi.fn(async () => ({ type: "offer" as const, sdp: "fake-offer-sdp" }));
  setLocalDescription = vi.fn(async () => {});
  setRemoteDescription = vi.fn(async () => {});
  close = vi.fn(() => {
    this.closed = true;
  });

  // テスト用ヘルパー: 接続状態を変更してイベントを発火する。
  setConnectionState(s: string) {
    this.connectionState = s;
    this.dispatchEvent("connectionstatechange");
  }
}

function makeFetchMock() {
  return vi.fn(async (url: unknown) => {
    if (typeof url === "string" && url.includes("/api/realtime/client-secret")) {
      return { ok: true, json: async () => ({ clientSecret: "ek_test" }) } as unknown as Response;
    }
    // SDP 交換エンドポイント。
    return { ok: true, text: async () => "fake-answer-sdp" } as unknown as Response;
  });
}

describe("RealtimeSession 自動再接続", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    peerConnections = [];
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn(async () => new FakeStream()) },
    });
    vi.stubGlobal("fetch", makeFetchMock());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("CONNECTION_LOST から自動復帰する（字幕保持・エラー非表示）", async () => {
    const states: string[] = [];
    let errorCode: string | null = null;
    const session = new RealtimeSession({
      onDelta: () => {},
      onStateChange: (s) => states.push(s),
      onError: (c) => {
        errorCode = c;
      },
    });

    await session.start();
    expect(peerConnections.length).toBe(1);
    peerConnections[0].setConnectionState("connected");
    expect(states.at(-1)).toBe("live");

    // 瞬断発生。
    peerConnections[0].setConnectionState("failed");
    expect(states.at(-1)).toBe("reconnecting");
    expect(errorCode).toBeNull(); // 再接続中はエラー表示しない。

    // バックオフ(2秒)後に新しい接続を試行する。
    await vi.advanceTimersByTimeAsync(2000);
    expect(peerConnections.length).toBe(2);

    // 再接続が成功。
    peerConnections[1].setConnectionState("connected");
    expect(states.at(-1)).toBe("live");
    expect(errorCode).toBeNull();

    session.stop();
  });

  it("3回失敗すると再接続を諦めエラー表示にフォールバックする", async () => {
    let errorCode: string | null = null;
    const session = new RealtimeSession({
      onDelta: () => {},
      onError: (c) => {
        errorCode = c;
      },
    });

    await session.start();
    peerConnections[0].setConnectionState("connected");
    peerConnections[0].setConnectionState("failed"); // 1回目の再接続を予約。

    await vi.advanceTimersByTimeAsync(2000);
    expect(peerConnections.length).toBe(2);
    peerConnections[1].setConnectionState("failed"); // 2回目を予約。

    await vi.advanceTimersByTimeAsync(4000);
    expect(peerConnections.length).toBe(3);
    peerConnections[2].setConnectionState("failed"); // 3回目を予約。

    await vi.advanceTimersByTimeAsync(8000);
    expect(peerConnections.length).toBe(4);
    expect(errorCode).toBeNull(); // まだ4回目の判定前。

    peerConnections[3].setConnectionState("failed"); // 上限到達 → 諦めてエラー表示。
    expect(errorCode).toBe("CONNECTION_LOST");

    // 上限到達後はこれ以上再接続しない。
    await vi.advanceTimersByTimeAsync(10_000);
    expect(peerConnections.length).toBe(4);
  });

  it("再接続の待機中に手動 Stop すると、以降は再接続しない", async () => {
    const states: string[] = [];
    const session = new RealtimeSession({
      onDelta: () => {},
      onStateChange: (s) => states.push(s),
    });

    await session.start();
    peerConnections[0].setConnectionState("connected");
    peerConnections[0].setConnectionState("failed");
    expect(states.at(-1)).toBe("reconnecting");

    session.stop();
    expect(states.at(-1)).toBe("idle");

    // 予約されていたはずの再接続タイマーが発火しても新規接続は作られない。
    await vi.advanceTimersByTimeAsync(5000);
    expect(peerConnections.length).toBe(1);
  });
});
