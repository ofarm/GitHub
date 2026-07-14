// テスト用: 有効な Auth.js v5 セッション cookie を「偽造」するヘルパー。
// 実 Google OAuth を経由せず、next-auth/jwt の encode を直接呼んでセッション JWT を発行する。
// 本文（音声/transcript/翻訳）とは無関係。実キー・実メールは使わない。
//
// v5 の decode/encode は salt = cookie 名を要求する（next-auth/jwt getToken の既定値）。
import { encode } from "next-auth/jwt";
import type { BrowserContext } from "@playwright/test";
import { E2E_AUTH_SECRET, E2E_ALLOWED_EMAIL, SESSION_COOKIE_NAME, E2E_BASE_URL } from "./testEnv";

/** allowlist 済みの架空メールで、認証済みセッション JWT 文字列を発行する。 */
export async function forgeSessionToken(email: string = E2E_ALLOWED_EMAIL): Promise<string> {
  return encode({
    secret: E2E_AUTH_SECRET,
    salt: SESSION_COOKIE_NAME,
    token: {
      email,
      name: "E2E Test User",
      sub: "e2e-test-user",
    },
  });
}

/** BrowserContext に認証済みセッション cookie を注入する（ナビゲーション前に呼ぶこと）。 */
export async function addAuthenticatedSessionCookie(
  context: BrowserContext,
  email: string = E2E_ALLOWED_EMAIL,
): Promise<void> {
  const token = await forgeSessionToken(email);
  const url = new URL(E2E_BASE_URL);
  await context.addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: token,
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}
