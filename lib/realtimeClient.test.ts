import { describe, expect, it } from "vitest";
import { extractDelta, isSessionExpiredEvent } from "./realtimeClient";

// テストデータは架空かつ無害な短文のみ。
describe("extractDelta", () => {
  it("output_transcript.delta は日本語訳(translation)として抽出する", () => {
    expect(extractDelta({ type: "session.output_transcript.delta", delta: "こんにちは" })).toEqual({
      kind: "translation",
      text: "こんにちは",
    });
  });

  it("input_transcript.delta は英語原文(source)として抽出する", () => {
    expect(extractDelta({ type: "session.input_transcript.delta", delta: "Hello" })).toEqual({
      kind: "source",
      text: "Hello",
    });
  });

  it("input_audio_transcription も source として扱う", () => {
    expect(
      extractDelta({
        type: "conversation.item.input_audio_transcription.delta",
        delta: "Hi there",
      }),
    ).toEqual({ kind: "source", text: "Hi there" });
  });

  it("オブジェクト delta(.text) からも抽出する", () => {
    expect(
      extractDelta({ type: "response.audio_transcript.delta", delta: { text: "テスト" } }),
    ).toEqual({ kind: "translation", text: "テスト" });
  });

  it(".delta 以外のイベントは null（無視）", () => {
    expect(extractDelta({ type: "response.created" })).toBeNull();
    expect(extractDelta({ type: "session.updated", delta: "x" })).toBeNull();
  });

  it("不正な入力に対して安全に null を返す", () => {
    expect(extractDelta(null)).toBeNull();
    expect(extractDelta(undefined)).toBeNull();
    expect(extractDelta("string")).toBeNull();
    expect(extractDelta({ type: "x.delta", delta: 123 })).toBeNull();
    expect(extractDelta({})).toBeNull();
  });
});

describe("isSessionExpiredEvent", () => {
  it("error.code に session_expired を含むイベントを検知する", () => {
    expect(
      isSessionExpiredEvent({ type: "error", error: { code: "session_expired" } }),
    ).toBe(true);
    expect(
      isSessionExpiredEvent({
        type: "error",
        error: { code: "realtime_session_expired", message: "..." },
      }),
    ).toBe(true);
  });

  it("無関係なイベント・エラーは false", () => {
    expect(isSessionExpiredEvent({ type: "response.created" })).toBe(false);
    expect(isSessionExpiredEvent({ type: "error", error: { code: "invalid_request" } })).toBe(
      false,
    );
    expect(isSessionExpiredEvent({ type: "error" })).toBe(false);
    expect(isSessionExpiredEvent(null)).toBe(false);
    expect(isSessionExpiredEvent({})).toBe(false);
  });
});
