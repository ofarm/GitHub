import { describe, expect, it } from "vitest";
import { safetyIdFor } from "./safetyId";

describe("safetyIdFor", () => {
  it("同じメールには安定した同一IDを返す", () => {
    process.env.SAFETY_ID_SALT = "test-salt";
    expect(safetyIdFor("owner@example.com")).toBe(safetyIdFor("owner@example.com"));
  });

  it("平文メールを含まない（ハッシュ化されている）", () => {
    process.env.SAFETY_ID_SALT = "test-salt";
    const id = safetyIdFor("owner@example.com");
    expect(id).not.toContain("owner@example.com");
    expect(id).toMatch(/^u_[a-f0-9]{32}$/);
  });

  it("大文字小文字・空白を正規化して同一になる", () => {
    process.env.SAFETY_ID_SALT = "test-salt";
    expect(safetyIdFor(" OWNER@Example.com ")).toBe(safetyIdFor("owner@example.com"));
  });

  it("ソルトが異なれば異なるIDになる", () => {
    process.env.SAFETY_ID_SALT = "salt-a";
    const a = safetyIdFor("owner@example.com");
    process.env.SAFETY_ID_SALT = "salt-b";
    const b = safetyIdFor("owner@example.com");
    expect(a).not.toBe(b);
  });
});
