import { describe, expect, it } from "vitest";
import { extractDeltaText } from "./realtimeClient";

// テストデータは架空かつ無害な短文のみ。
describe("extractDeltaText", () => {
  it("文字列 delta を持つ .delta イベントからテキストを抽出する", () => {
    expect(extractDeltaText({ type: "response.output_text.delta", delta: "こんにちは" })).toBe(
      "こんにちは",
    );
  });

  it("オブジェクト delta(.text) からテキストを抽出する", () => {
    expect(
      extractDeltaText({ type: "response.audio_transcript.delta", delta: { text: "テスト" } }),
    ).toBe("テスト");
  });

  it(".delta 以外のイベントは null（無視）", () => {
    expect(extractDeltaText({ type: "response.created" })).toBeNull();
    expect(extractDeltaText({ type: "session.updated", delta: "x" })).toBeNull();
  });

  it("不正な入力に対して安全に null を返す", () => {
    expect(extractDeltaText(null)).toBeNull();
    expect(extractDeltaText(undefined)).toBeNull();
    expect(extractDeltaText("string")).toBeNull();
    expect(extractDeltaText({ type: "x.delta", delta: 123 })).toBeNull();
    expect(extractDeltaText({})).toBeNull();
  });
});
