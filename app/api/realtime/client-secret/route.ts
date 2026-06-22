import { auth } from "@/auth";
import { isAllowedEmail } from "@/lib/allowlist";
import { safetyIdFor } from "@/lib/safetyId";
import { checkRateLimit } from "@/lib/rateLimit";
import { extractClientSecret, extractExpiresAt } from "@/lib/openaiResponse";

// ブラウザに渡す「短命 client secret(ek_...)」を発行するサーバー専用 API。
// 非交渉制約:
//  - 標準 OPENAI_API_KEY は絶対にレスポンスへ含めない（ek_ のみ返す）。
//  - 認証 + allowlist + レート制限を通過したリクエストのみ発行。
//  - 本文・メール平文・トークンをログに出さない。
//
// ⚠️ verify: OpenAI 側の正確なリクエスト/レスポンス・スキーマ、translate セッション設定、
//    実モデル名は最新の公式 API リファレンスで確認すること（docs/privacy-data-handling 参照）。
//    レスポンス解釈は複数フィールドに対して防御的に実装している。

export const runtime = "nodejs"; // node:crypto(safetyId) を使うため edge 不可。

// translate 専用の client secret 発行エンドポイント（GA）。env で上書き可。
// ⚠️ verify: 正確なパス/ボディは最新 API リファレンスで確認（2026-05-12 に beta 廃止済）。
const OPENAI_CLIENT_SECRETS_URL =
  process.env.OPENAI_CLIENT_SECRETS_URL ??
  "https://api.openai.com/v1/realtime/translations/client_secrets";

function jsonError(code: string, status: number, extra?: Record<string, unknown>) {
  return Response.json({ error: code, ...extra }, { status });
}

export async function POST() {
  // 1) 認証
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return jsonError("AUTH_REQUIRED", 401);

  // 2) 認可（多層防御: middleware に加えてここでも allowlist 照合）
  if (!isAllowedEmail(email)) return jsonError("NOT_ALLOWED", 403);

  // 3) レート制限（ハッシュ識別子をキーに）
  const safetyId = safetyIdFor(email);
  const rl = checkRateLimit(safetyId);
  if (!rl.ok) {
    return jsonError("RATE_LIMITED", 429, { retryAfterSec: rl.retryAfterSec });
  }

  // 4) 環境変数
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return jsonError("SERVER_MISCONFIGURED", 500);
  const model = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-translate";
  const ttl = Number(process.env.REALTIME_CLIENT_SECRET_TTL_SECONDS ?? "120");
  // 出力言語（日本語）。入力言語は translate モデルが自動判定（70+ 言語対応）。
  const targetLang = process.env.TRANSLATE_TARGET_LANG ?? "ja";

  // 5) OpenAI へ短命トークン発行を依頼（標準キーはサーバー内のみで使用）
  let upstream: Response;
  try {
    upstream = await fetch(OPENAI_CLIENT_SECRETS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // 平文メールではなくハッシュ識別子を送る。
        "OpenAI-Safety-Identifier": safetyId,
      },
      body: JSON.stringify({
        expires_after: { anchor: "created_at", seconds: ttl },
        // translate セッション設定。出力言語は session.audio.output.language。
        // ⚠️ verify: 入力 transcription/noise_reduction 等の任意キーは最新ドキュメントで確認。
        session: {
          type: "realtime",
          model,
          audio: {
            input: { transcription: { model: "gpt-realtime-whisper" } },
            output: { language: targetLang },
          },
        },
      }),
    });
  } catch {
    // 例外本文をそのまま返さない/ログしない（種別のみ）。
    return jsonError("UPSTREAM_UNREACHABLE", 502);
  }

  if (!upstream.ok) {
    // 上流エラー本文を返さない（情報漏えい・本文混入回避）。ステータスのみ転送。
    return jsonError("UPSTREAM_ERROR", 502, { upstreamStatus: upstream.status });
  }

  const data: unknown = await upstream.json().catch(() => null);
  const clientSecret = extractClientSecret(data);
  if (!clientSecret) return jsonError("UPSTREAM_BAD_SHAPE", 502);

  // 6) ブラウザには ek_ と接続に必要な最小情報のみ返す（標準キーは返さない）。
  return Response.json(
    {
      clientSecret,
      expiresAt: extractExpiresAt(data),
      model,
    },
    { status: 200 },
  );
}
