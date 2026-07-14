// E2E テスト専用の設定値。
// 非交渉制約: 実キー・実メール・実会話データは使わない（架空のテスト値のみ）。
//
// AUTH_SECRET / ALLOWED_EMAILS はここで定義し、playwright.config.ts の webServer.env と
// e2e/session.ts（セッション cookie 偽造）の両方から参照する（値のズレを防ぐ）。

export const E2E_PORT = 3100;
export const E2E_BASE_URL = `http://127.0.0.1:${E2E_PORT}`;

// テスト専用の静的シークレット。本番の AUTH_SECRET とは無関係（実キーではない）。
export const E2E_AUTH_SECRET = "e2e-test-only-static-secret-do-not-use-in-prod";

// 架空のテストメール（allowlist に1件だけ登録する）。
export const E2E_ALLOWED_EMAIL = "e2e-test@example.com";

// Auth.js v5 の既定セッション cookie 名（非 HTTPS のためプレフィックスなし）。
// 参照: node_modules/@auth/core/src/lib/utils/cookie.ts defaultCookies()。
export const SESSION_COOKIE_NAME = "authjs.session-token";
