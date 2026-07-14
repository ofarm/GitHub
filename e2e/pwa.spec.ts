import { test, expect } from "@playwright/test";

// PWA マニフェスト/アイコンの静的メタ情報の検証（本文とは無関係）。

test.describe("PWA メタ情報", () => {
  test("/manifest.webmanifest は 200・想定フィールドを含む", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.status()).toBe(200);
    const manifest = await response.json();
    expect(manifest.start_url).toBe("/translate");
    expect(manifest.display).toBe("standalone");
  });

  for (const path of ["/icon-192.png", "/icon-512.png"]) {
    test(`${path} は 200・image/png`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toBe("image/png");
    });
  }
});
