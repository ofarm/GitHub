// OpenAI client_secrets レスポンスの防御的パーサ。
// ⚠️ verify: 正確なレスポンス形は最新 API リファレンスで確認すること。
// レスポンス形状のゆれ（value / client_secret.value など）に防御的に対応する。

export function extractClientSecret(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.value === "string") return d.value;
  const cs = d.client_secret;
  if (cs && typeof cs === "object" && typeof (cs as Record<string, unknown>).value === "string") {
    return (cs as Record<string, unknown>).value as string;
  }
  return null;
}

export function extractExpiresAt(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.expires_at === "number") return d.expires_at;
  const cs = d.client_secret;
  if (cs && typeof cs === "object" && typeof (cs as Record<string, unknown>).expires_at === "number") {
    return (cs as Record<string, unknown>).expires_at as number;
  }
  return null;
}
