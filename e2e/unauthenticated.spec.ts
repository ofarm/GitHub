import { test, expect } from "@playwright/test";

// 未認証フローの検証。cookie を一切付与しないデフォルトのブラウザコンテキストを使う。
// 本文（音声/transcript/翻訳）には一切触れない、画面表示とHTTPステータスのみの確認。

test.describe("未認証フロー", () => {
  test("/ は未認証で表示され「Google でログイン」ボタンがある", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("button", { name: "Google でログイン" })).toBeVisible();
  });

  test("未認証で /translate は / へリダイレクトされる", async ({ page }) => {
    await page.goto("/translate");
    await expect(page).toHaveURL(/\/$/);
    // リダイレクト後は未認証トップページが表示される（多層防御の確認）。
    await expect(page.getByRole("button", { name: "Google でログイン" })).toBeVisible();
  });

  test("未認証 POST /api/realtime/client-secret は 401", async ({ request }) => {
    const response = await request.post("/api/realtime/client-secret");
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("AUTH_REQUIRED");
  });
});
