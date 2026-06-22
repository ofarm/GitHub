# docs/security-review.md — セキュリティレビュー記録

## レビュー #1 — 2026-06-22（静的・自動検証）

対象: Sprint 0〜2 実装（認証・client secret 発行 API・WebRTC 配線・字幕 UI）。
方法: `docs/security.md` チェックリストに対する静的レビュー + grep + 単体テスト(27件)。
判定: **Critical/High の指摘なし**（静的範囲）。実鍵が必要なランタイム項目は人間確認に残す（`docs/human-todo.md`）。

### チェックリスト結果

| 区分 | 項目 | 結果 | 根拠 |
|---|---|---|---|
| A | クライアントに標準キー/秘密が無い | ✅ | `.next/static` grep で `OPENAI_API_KEY`/`sk-`/各 secret なし。キーは nodejs runtime の route のみ |
| A | `NEXT_PUBLIC_` に秘密が無い | ✅ | 使用は `NEXT_PUBLIC_REALTIME_BASE_URL`（非秘密の接続先 URL）のみ |
| A | `.env` 非コミット / example は実値無し | ✅ | `.gitignore` で `.env*`（example 除外）。`.env.example` は `REPLACE_ME` |
| B | 未認証で `/translate`/API 拒否 | ✅ | `middleware.ts`（401/redirect）+ route の `auth()` 検証。route テストで 401 |
| B | 許可外メールを拒否 | ✅ | `signIn` コールバック + middleware + route + ページの多層。テストで 403 |
| B | 発行は認証+allowlist+rate 通過後のみ | ✅ | route 実装 + テスト（401/403/429、未認証時は OpenAI を呼ばない） |
| C | レスポンスに標準キーが無い（ek_ のみ） | ✅ | テスト: `JSON.stringify(body)` に `sk-` を含まない／`clientSecret` は `ek_` |
| C | TTL 短い（既定120秒） | ✅ | `REALTIME_CLIENT_SECRET_TTL_SECONDS=120`、`expires_after` に反映 |
| C | Safety-Id がハッシュ（平文メール不送信） | ✅ | テスト: ヘッダが `^u_[a-f0-9]{32}$`、リクエストに平文メール無し |
| D | 本文を DB/ファイル/storage に保存しない | ✅ | DB 無し、storage 不使用（grep）。字幕はメモリ state のみ |
| D | 本文/メール平文/トークンをログに出さない | ✅ | `console.*` 不使用（grep）、例外本文を返さず種別コードに正規化 |
| D | localStorage/sessionStorage/IndexedDB 不使用 | ✅ | grep で該当なし |
| E | HTTPS/secure cookie/SameSite/CSP/CORS | ✅(静的) | Auth.js 既定 cookie、`next.config` に CSP/HSTS/Permissions-Policy。実 HTTPS は本番で確認 |
| E | `dangerouslySetInnerHTML` 不使用 | ✅ | grep で該当なし（テキストノード描画） |
| E | CSP connect-src を接続先に限定 | △ | OpenAI ホストに限定済。⚠️実 Realtime ホストの確定で最小化（H-2） |
| F | `npm audit` high/critical 対応 | △ | dev/build 推移依存のみ。例外を security.md §18 に記録（T5.2） |

凡例: ✅=確認済 / △=条件付き・残あり。

### 残課題（人間確認・ランタイム）
- 実 OAuth ログインの E2E（許可/許可外/未認証）→ H-1。
- OpenAI 実 wire スキーマ・SDP URL・event 名の検証 → H-2。CSP connect-src の最終最小化。
- iPhone 実機での secure context・マイク権限・解放 → H-4。
- ZDR/Modified Abuse Monitoring の承認状況 → H-3。

### 次回レビュー時の追加観点
- 実 OAuth セッションでの CSRF（state/PKCE）動作確認。
- 本番ヘッダ（HSTS/CSP）がブラウザに正しく適用されているか。
- レート制限がデプロイ環境（サーバーレス多重インスタンス）で機能するか（必要ならエッジ KV へ）。

## レビュー #2 — 2026-06-22（本番動作後・再点検）

対象: 翻訳が本番動作した後の全コード（WebRTC/診断/音声トグル含む）。判定: **Critical/High なし**。

- ✅ クライアントバンドルに秘密の**値**なし。`.next/static` の grep で `OPENAI_API_KEY` がヒットするが、これは UI エラーメッセージ内の**変数名の文字列**（"サーバーに OPENAI_API_KEY が未設定です…"）であり、値ではない。`sk-` トークン・`AUTH_SECRET`・`GOOGLE_SECRET`・`SAFETY_ID_SALT` はバンドルに**無し**。
- ✅ `console.*` はサーバー route の client secret **発行段階のみ**（上流エラーの status/code）。音声送信前で会話本文は存在せず、§13 の許容例外に合致。クライアント側に `console.*` は無し。
- ✅ storage 不使用、`dangerouslySetInnerHTML` 不使用（コメントのみ）。`NEXT_PUBLIC_` は非秘密の接続先 URL のみ。
- ✅ 診断（onEvent/onDiag）は種別名・キー名・接続状態・音量レベルのみで、**本文は渡さない**。`?debug=1` 時のみ表示。
- ✅ 翻訳音声は既定ミュート。字幕はメモリ state のみ（保存なし）。
- 残課題（変更なし）: 実 HTTPS ヘッダ適用確認、レート制限の多重インスタンス挙動、H-3(ZDR)・H-4(iPhone)。
