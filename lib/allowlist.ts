// 許可メール(allowlist)の照合ユーティリティ。
// ALLOWED_EMAILS（カンマ区切り）に含まれるメールのみ利用可。
// 注意: ここでは本文やメールをログに出さない。

function parseAllowed(): Set<string> {
  const raw = process.env.ALLOWED_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0),
  );
}

/** email が allowlist に含まれるか。null/undefined は false。 */
export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = parseAllowed();
  return allowed.has(email.trim().toLowerCase());
}
