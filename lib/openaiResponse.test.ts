import { describe, expect, it } from "vitest";
import { extractClientSecret, extractExpiresAt } from "./openaiResponse";

describe("extractClientSecret", () => {
  it("value / client_secret.value の両形に対応", () => {
    expect(extractClientSecret({ value: "ek_a" })).toBe("ek_a");
    expect(extractClientSecret({ client_secret: { value: "ek_b" } })).toBe("ek_b");
  });

  it("不正・欠落入力は null", () => {
    expect(extractClientSecret({ nope: 1 })).toBeNull();
    expect(extractClientSecret(null)).toBeNull();
    expect(extractClientSecret("x")).toBeNull();
  });
});

describe("extractExpiresAt", () => {
  it("expires_at / client_secret.expires_at の両形に対応", () => {
    expect(extractExpiresAt({ expires_at: 10 })).toBe(10);
    expect(extractExpiresAt({ client_secret: { expires_at: 20 } })).toBe(20);
  });

  it("欠落入力は null", () => {
    expect(extractExpiresAt({})).toBeNull();
    expect(extractExpiresAt(null)).toBeNull();
  });
});
