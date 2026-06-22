import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, _resetRateLimit } from "./rateLimit";

describe("checkRateLimit", () => {
  beforeEach(() => _resetRateLimit());

  it("窓内の上限まで許可し、超過で拒否する", () => {
    const key = "u_test";
    const now = 1_000_000;
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit(key, now).ok).toBe(true);
    }
    const blocked = checkRateLimit(key, now);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("窓を超えるとリセットされ再び許可する", () => {
    const key = "u_test";
    const now = 1_000_000;
    for (let i = 0; i < 10; i++) checkRateLimit(key, now);
    expect(checkRateLimit(key, now).ok).toBe(false);
    // 61秒後
    expect(checkRateLimit(key, now + 61_000).ok).toBe(true);
  });

  it("キーごとに独立してカウントする", () => {
    const now = 1_000_000;
    for (let i = 0; i < 10; i++) checkRateLimit("u_a", now);
    expect(checkRateLimit("u_a", now).ok).toBe(false);
    expect(checkRateLimit("u_b", now).ok).toBe(true);
  });
});
