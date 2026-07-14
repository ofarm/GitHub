import { defineConfig, devices } from "@playwright/test";
import { E2E_BASE_URL, E2E_PORT, E2E_AUTH_SECRET, E2E_ALLOWED_EMAIL } from "./e2e/testEnv";

// V2.6 E2E テスト設定。
// - 本番相当の挙動を検証するため `next build` + `next start`（本番サーバー）で起動する。
// - 認証は実 Google OAuth を使わず、テスト側でセッション cookie を偽造する
//   （e2e/session.ts）。そのため AUTH_SECRET / ALLOWED_EMAILS はテスト専用の架空値。
// - OPENAI_API_KEY は意図的に未設定のまま（SERVER_MISCONFIGURED の配線確認のため）。
// - 環境の Chromium は /opt/pw-browsers にプリインストール済み。`playwright install` は
//   実行しない。@playwright/test は同梱 Chromium のリビジョン(1194)に一致する 1.56.1 を使用。
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    baseURL: E2E_BASE_URL,
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: "/opt/pw-browsers/chromium",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // 本文ログ禁止方針に反しないビルド/起動のみ（本文は一切扱わない静的経路）。
    command: `npm run build && npm run start -- -p ${E2E_PORT} -H 127.0.0.1`,
    url: E2E_BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      // テスト専用・架空値のみ。実キー/実メールは使わない。
      AUTH_SECRET: E2E_AUTH_SECRET,
      ALLOWED_EMAILS: E2E_ALLOWED_EMAIL,
      AUTH_URL: E2E_BASE_URL,
      AUTH_TRUST_HOST: "true",
      // OPENAI_API_KEY は意図的に未設定 → client-secret 発行は SERVER_MISCONFIGURED になる。
    },
  },
});
