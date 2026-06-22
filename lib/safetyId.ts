import { createHash } from "node:crypto";

// OpenAI-Safety-Identifier に使う安定した匿名識別子を生成する。
// 平文メールを OpenAI へ送らないため、SAFETY_ID_SALT でハッシュ化する。
// 注意: サーバー専用（node:crypto）。middleware(edge) からは呼ばない。

/** email から安定したハッシュ識別子を作る。同じ email は常に同じ値。 */
export function safetyIdFor(email: string): string {
  const salt = process.env.SAFETY_ID_SALT ?? "";
  const normalized = email.trim().toLowerCase();
  const digest = createHash("sha256").update(`${salt}:${normalized}`).digest("hex");
  // 先頭のみ使用（識別には十分・本文とは紐付かない）。
  return `u_${digest.slice(0, 32)}`;
}
