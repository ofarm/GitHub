import { test, expect } from "@playwright/test";
import { addAuthenticatedSessionCookie } from "./session";

// 認証済みフロー（セッション偽造）。実 Google OAuth は使わず、allowlist 済みの架空メール
// (e2e-test@example.com) で発行したセッション cookie を注入して /translate を検証する。
//
// Start 押下時にマイク権限(getUserMedia)を許可していないが、これは意図的:
// lib/realtimeClient.ts の RealtimeSession.connectOnce() は
//   1) fetch('/api/realtime/client-secret')  ← 先に必ず実行される
//   2) getUserMedia(...)                     ← client secret 取得成功後にのみ実行
// の順で処理するため、OPENAI_API_KEY 未設定によりサーバーが 500 SERVER_MISCONFIGURED を
// 返す本テスト環境では、getUserMedia には到達せずエラー表示に落ちる。
// これにより「クライアント → API の配線」を、マイク権限なしで end-to-end に確認できる。

test.describe("認証済みフロー（セッション偽造）", () => {
  test.beforeEach(async ({ context }) => {
    await addAuthenticatedSessionCookie(context);
  });

  test("/translate が表示され、Start 押下で SERVER_MISCONFIGURED が表示される", async ({
    page,
  }) => {
    const response = await page.goto("/translate");
    expect(response?.status()).toBe(200);

    // 翻訳UI本体（Controls / Subtitles）が表示されていること。
    const startButton = page.getByRole("button", { name: "Start" });
    const stopButton = page.getByRole("button", { name: "Stop" });
    const clearButton = page.getByRole("button", { name: "Clear" });
    await expect(startButton).toBeVisible();
    await expect(stopButton).toBeVisible();
    await expect(clearButton).toBeVisible();

    // 字幕エリアのプレースホルダ文言（本文が無い状態の初期表示）。
    await expect(
      page.getByText(
        "Start を押すと、英語の音声がリアルタイムで日本語に翻訳され、英語原文と併記表示されます。",
      ),
    ).toBeVisible();

    // Start → クライアントはまず /api/realtime/client-secret を叩く。
    // OPENAI_API_KEY 未設定のため 500 SERVER_MISCONFIGURED が返り、
    // そのままエラー表示に反映される（client→API 配線の生存確認）。
    await startButton.click();
    // Next.js のルートアナウンサー（role="alert" の空 div）と区別するため、
    // エラーメッセージ本文で直接テキストを特定する。
    await expect(
      page.getByText("サーバーに OPENAI_API_KEY が未設定です", { exact: false }),
    ).toBeVisible();
  });
});
