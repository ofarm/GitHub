# docs/security.md — セキュリティ設計とチェックリスト

設計思想の優先順位（高→低）: ①秘密を漏らさない ②標準キーをブラウザに出さない ③認証・認可必須 ④本文を保存しない ⑤本文をログに出さない ⑥軽量 ⑦リアルタイム性 ⑧小さく作る ⑨安全に拡張 ⑩トークンコスト。衝突時は安全側・ログ削減を優先。

## 1. 認証方式

- Auth.js (NextAuth v5) + OAuth（既定 **Google**。理由: 自分のアカウントで完結、メール取得が容易、パスワード管理不要）。
- セッションは JWT or DB セッション。MVP は DB 無し方針のため **JWT セッション（cookie）** を採用。
- 全ページ / API は既定で認証必須。公開は `/`（ログイン導線）と認証コールバックのみ。

## 2. 認可方式（allowlisted email）

- `ALLOWED_EMAILS`（カンマ区切り）と照合。`signIn` コールバックで一致しなければ **サインインを拒否**（セッションを発行しない）。
- API route 側でも毎回 `session.user.email` を allowlist 照合（多層防御）。不一致は 403。
- メール照合は小文字化・トリムして比較。

## 3. session cookie 設定

- `httpOnly: true`, `secure: true`（本番）, `sameSite: "lax"`, `path: "/"`。
- 有効期限は短め（例: 数時間〜1日）。`AUTH_SECRET` は 32 バイト以上のランダム。

## 4. CSRF 対策

- Auth.js 内蔵の CSRF トークン（state / PKCE）を利用。
- 状態変更系 API（client secret 発行）は POST のみ受け付け、`sameSite=lax` cookie + Origin/Host チェックで CSRF を緩和。
- カスタム API は GET で副作用を持たせない。

## 5. XSS 対策

- 字幕表示は React のテキストノードとしてレンダリング（`dangerouslySetInnerHTML` 禁止）。
- ユーザー / API 由来文字列を HTML として挿入しない。
- CSP（下記）でインラインスクリプトを制限。

## 6. CORS 方針

- API route は同一オリジンのみ想定。`Access-Control-Allow-Origin` を `*` にしない。
- WebRTC は OpenAI への発信接続のため、サーバー側 CORS 緩和は不要。

## 7. CSP 方針（目安）

- `default-src 'self'`
- `connect-src 'self' https://api.openai.com https://*.openai.com`（Realtime / WebRTC シグナリング先。実ホストは実装時に確認）
- `script-src 'self'`（Next.js が要求する範囲で nonce を使用）
- `media-src 'self' blob:`（マイク / 音声）
- `img-src 'self' data:`、`style-src 'self' 'unsafe-inline'`（必要最小）
- `frame-ancestors 'none'`、`object-src 'none'`、`base-uri 'self'`
- 実装時に Realtime の実接続先ホストを確認して `connect-src` を最小化。

## 8. レート制限

- client secret 発行 API に**ユーザー識別子単位**の簡易レート制限（例: 60 秒に N 回）。
- MVP はメモリ / エッジ KV で十分（個人利用）。超過時 429。
- ログインエンドポイントは OAuth プロバイダ側に依存。

## 9. API key 管理

- `OPENAI_API_KEY` はサーバー（API route）でのみ参照。クライアントバンドルに含めない。
- `NEXT_PUBLIC_` を秘密情報に付けない。
- ビルド成果物に秘密が混入していないか、`npm run build` 後に grep で確認（CI チェック候補）。

## 10. client secret 発行（フロー）

1. ブラウザが `POST /api/realtime/client-secret` を呼ぶ（cookie 認証付き）。
2. サーバーが ①セッション有無 ②allowlist を検証。失敗で 401/403。
3. レート制限を確認。
4. サーバーが `OPENAI_API_KEY` で `POST https://api.openai.com/v1/realtime/client_secrets` を呼ぶ。
   - `OpenAI-Safety-Identifier` ヘッダにハッシュ化識別子を付与。
   - TTL = `REALTIME_CLIENT_SECRET_TTL_SECONDS`（既定 120秒）。
   - モデル = `gpt-realtime-translate`、入力 `en` / 出力 `ja` のセッション設定。
5. レスポンスから **client secret（`ek_...`）と接続に必要な最小情報のみ**返す。標準キーは返さない。

## 11. Safety Identifier の扱い

- 平文メールを送らない。`hash(email + SAFETY_ID_SALT)`（例: SHA-256, 安定値）を使用。
- 目的: OpenAI 側の不正利用検知に協力しつつ、個人特定情報の送信を避ける。

## 12. エラー処理

- 例外はサーバーで握りつぶさず、**正規化したコード**（例: `AUTH_REQUIRED`, `NOT_ALLOWED`, `RATE_LIMITED`, `UPSTREAM_ERROR`）にしてクライアントへ返す。本文・スタック・APIキーを返さない。
- クライアントは種別に応じて再接続 / 再ログイン導線を出す。

## 13. ログ方針

- 出してよい: イベント種別、時刻、HTTP ステータス、正規化エラーコード、ハッシュ識別子、レート制限カウンタ。
- 出さない: 音声 / transcript / 翻訳本文 / 会話 / メール平文 / トークン / APIキー。
- `console.log(delta)` のようなデバッグを残さない（lint ルール or レビューで検出）。

## 14. secrets 管理 / .env.example 方針

- `.env.local` は `.gitignore`。`.env.example` は**キー名と説明のみ**、実値は `REPLACE_ME`。
- 本番はデプロイ先の暗号化環境変数。ローテーション手順を docs に残す。

## 15. dependency audit

- `npm audit`（high 以上はリリース前に解消 or 例外理由を記録）。
- 依存追加は最小限・理由明記。lockfile をコミット。

## 18. npm audit 例外記録（2026-06-22 時点）

`npm install` 後の audit で moderate〜critical が報告されるが、**いずれも dev/build 時の推移的依存**であり、本番ランタイムの攻撃面ではない。`npm audit fix --force` は Next/vitest を破壊的に旧版へ降格させるため**実施しない**。MVP では下記を受容例外として記録し、上流の更新で解消する。

- `esbuild`（vitest → vite 経由）: 開発サーバの脆弱性。本番は dev サーバを動かさないため非該当。
- `postcss`（Next 経由・CSS Stringify の XSS）: 攻撃者制御の CSS 入力が前提。本アプリにそのような経路はない。
- これらは Next / vitest の上流が patch を出し次第バージョン更新で解消（T5.2）。

リリース前に再評価し、ランタイムに影響する high/critical が出た場合は解消を必須とする。

## 16. デプロイ / HTTPS 前提

- 本番は HTTPS 必須（マイク getUserMedia は secure context が必要）。
- ローカルは `http://localhost`（secure context 扱い）で可。

## 17. iPhone Safari マイク権限

- `getUserMedia` は**ユーザー操作（Start タップ）起点**で呼ぶ（自動起動不可）。
- 初回は権限ダイアログ。拒否時の再許可導線（設定案内）を UI に出す。
- バックグラウンド遷移 / 着信でストリームが止まる前提。復帰時の再接続を実装。
- 自動再生制約により、音声出力する場合はユーザー操作必須（MVP は字幕のみで回避）。

---

## セキュリティ確認チェックリスト

### A. 秘密情報 / キー
- [ ] クライアントバンドルに `OPENAI_API_KEY` / 秘密が含まれない（build 後 grep）。
- [ ] `NEXT_PUBLIC_` に秘密が無い。
- [ ] `.env.local` 非コミット、`.env.example` は実値無し。

### B. 認証 / 認可
- [ ] 未認証で `/translate` / API が拒否される。
- [ ] 許可外メールがサインイン拒否される（コールバック + API 二重）。
- [ ] client secret 発行が認証 + allowlist + レート制限を通過後のみ。

### C. client secret
- [ ] レスポンスに標準キーが含まれない（`ek_` のみ）。
- [ ] TTL が短い（既定 120秒）。
- [ ] Safety Identifier がハッシュ値（平文メールでない）。

### D. データ / ログ
- [ ] 本文が DB / ファイル / ストレージに保存されない。
- [ ] 本文 / メール平文 / トークンがログ・console に出ない。
- [ ] localStorage / sessionStorage / IndexedDB に本文が無い。

### E. Web セキュリティ
- [ ] HTTPS / secure cookie / SameSite / CSP / CORS 設定済み。
- [ ] `dangerouslySetInnerHTML` 不使用。
- [ ] CSP の connect-src が実接続先に最小化。

### F. 依存 / ビルド
- [ ] `npm audit` high 以上を解消 or 記録。
- [ ] 新規依存は最小・理由明記。
