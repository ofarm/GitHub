import { afterEach, describe, expect, it } from "vitest";
import { isAllowedEmail } from "./allowlist";

// テストデータは架空かつ無害な短文のみ。
describe("isAllowedEmail", () => {
  const original = process.env.ALLOWED_EMAILS;
  afterEach(() => {
    process.env.ALLOWED_EMAILS = original;
  });

  it("allowlist 内のメールを許可する", () => {
    process.env.ALLOWED_EMAILS = "owner@example.com, second@example.com";
    expect(isAllowedEmail("owner@example.com")).toBe(true);
    expect(isAllowedEmail("second@example.com")).toBe(true);
  });

  it("大文字・前後空白を正規化して比較する", () => {
    process.env.ALLOWED_EMAILS = "owner@example.com";
    expect(isAllowedEmail("  OWNER@Example.com ")).toBe(true);
  });

  it("allowlist 外のメールを拒否する", () => {
    process.env.ALLOWED_EMAILS = "owner@example.com";
    expect(isAllowedEmail("intruder@example.com")).toBe(false);
  });

  it("null / undefined / 空文字を拒否する", () => {
    process.env.ALLOWED_EMAILS = "owner@example.com";
    expect(isAllowedEmail(null)).toBe(false);
    expect(isAllowedEmail(undefined)).toBe(false);
    expect(isAllowedEmail("")).toBe(false);
  });

  it("ALLOWED_EMAILS が未設定なら全て拒否する", () => {
    delete process.env.ALLOWED_EMAILS;
    expect(isAllowedEmail("owner@example.com")).toBe(false);
  });
});
