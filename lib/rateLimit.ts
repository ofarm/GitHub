// ユーザー単位の簡易レート制限（インメモリ）。
// MVP・個人利用向け。サーバーレスでインスタンスをまたぐと厳密ではないが、
// client secret 発行の濫用を抑える最低限の防御。将来はエッジ KV 等に置換可能。
// 注意: キー(ハッシュ識別子)以外をログに出さない。

const WINDOW_MS = 60_000; // 60秒窓
const MAX_IN_WINDOW = 10; // 窓内の最大発行回数

type Entry = { count: number; resetAt: number };
const buckets = new Map<string, Entry>();

export type RateResult = { ok: boolean; retryAfterSec: number };

/** key（ハッシュ識別子推奨）に対してレート制限を判定し、カウントを進める。 */
export function checkRateLimit(key: string, now: number = Date.now()): RateResult {
  const entry = buckets.get(key);
  if (!entry || now >= entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, retryAfterSec: 0 };
  }
  if (entry.count >= MAX_IN_WINDOW) {
    return { ok: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

/** テスト用: 状態をリセット。 */
export function _resetRateLimit(): void {
  buckets.clear();
}
