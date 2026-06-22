import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// @/auth をモックして next-auth 本体のロードを避ける。
vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import { POST } from "./route";
import { _resetRateLimit } from "@/lib/rateLimit";

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const STANDARD_KEY = "sk-test-MUST-NOT-LEAK";

function mockOpenAiOk(value = "ek_test_secret", expires_at = 1234567890) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ value, expires_at }),
  }) as unknown as typeof fetch;
}

describe("POST /api/realtime/client-secret", () => {
  beforeEach(() => {
    _resetRateLimit();
    mockAuth.mockReset();
    process.env.ALLOWED_EMAILS = "owner@example.com";
    process.env.SAFETY_ID_SALT = "test-salt";
    process.env.OPENAI_API_KEY = STANDARD_KEY;
    process.env.REALTIME_CLIENT_SECRET_TTL_SECONDS = "120";
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("未認証は 401 を返し、OpenAI を呼ばない", async () => {
    mockAuth.mockResolvedValue(null);
    const fetchSpy = (global.fetch = vi.fn() as unknown as typeof fetch);
    const res = await POST();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "AUTH_REQUIRED" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("許可外メールは 403 を返し、OpenAI を呼ばない", async () => {
    mockAuth.mockResolvedValue({ user: { email: "intruder@example.com" } });
    const fetchSpy = (global.fetch = vi.fn() as unknown as typeof fetch);
    const res = await POST();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "NOT_ALLOWED" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("許可メールには ek_ を返し、標準キーをレスポンスに含めない", async () => {
    mockAuth.mockResolvedValue({ user: { email: "owner@example.com" } });
    mockOpenAiOk("ek_abc123");
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clientSecret).toBe("ek_abc123");
    // 標準キーがどこにも漏れていないこと。
    expect(JSON.stringify(body)).not.toContain("sk-");
  });

  it("OpenAI 呼び出しに Bearer 標準キーとハッシュ Safety-Id を付与し、平文メールを送らない", async () => {
    mockAuth.mockResolvedValue({ user: { email: "owner@example.com" } });
    mockOpenAiOk();
    await POST();
    const call = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = call[1].headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${STANDARD_KEY}`);
    expect(headers["OpenAI-Safety-Identifier"]).toMatch(/^u_[a-f0-9]{32}$/);
    expect(JSON.stringify(call)).not.toContain("owner@example.com");
  });

  it("レート制限超過で 429 を返す", async () => {
    mockAuth.mockResolvedValue({ user: { email: "owner@example.com" } });
    mockOpenAiOk();
    for (let i = 0; i < 10; i++) {
      expect((await POST()).status).toBe(200);
    }
    const res = await POST();
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("RATE_LIMITED");
  });

  it("上流エラーは 502（本文を転送しない）", async () => {
    mockAuth.mockResolvedValue({ user: { email: "owner@example.com" } });
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    const res = await POST();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("UPSTREAM_ERROR");
  });

  it("OPENAI_API_KEY 未設定は 500", async () => {
    mockAuth.mockResolvedValue({ user: { email: "owner@example.com" } });
    delete process.env.OPENAI_API_KEY;
    const res = await POST();
    expect(res.status).toBe(500);
  });
});
