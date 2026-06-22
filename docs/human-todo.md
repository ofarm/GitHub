# docs/human-todo.md — 人間（オーナー）の残作業

Agent は実鍵・実データを持てないため、ここに「人間にしかできない作業」を集約する。
各項目は完了したら `[x]` にし、対応する `TASKS.md` のチケットも更新する。

> ⚠️ ここに **実 API キー・実 OAuth シークレット・実会話ログを書かない**。状態と確認結果のメモのみ。

## 優先度: 高（リリースに必須）

- [ ] **H-1 実 Google OAuth セットアップ**（→ T1.1.1 / T5.3）
  - Google Cloud Console で OAuth クライアント作成。
  - リダイレクト URI: `http://localhost:3000/api/auth/callback/google`（本番は本番ドメイン）。
  - `.env.local` に `AUTH_GOOGLE_ID/SECRET`・`AUTH_SECRET`(`openssl rand -base64 32`)・`ALLOWED_EMAILS` を設定。
  - 確認: 許可メールでログイン成功、許可外メールはサインイン拒否されること。

- [ ] **H-2 OpenAI 実 wire スキーマ検証**（→ T2.1.2 / T3.1.1、コードの `⚠️ verify` 箇所）
  - `.env.local` に実 `OPENAI_API_KEY`、ZDR/Modified Abuse Monitoring 承認済みの組織/プロジェクト。
  - `POST /v1/realtime/client_secrets` の正確なリクエストボディ（特に translate セッション設定キー）とレスポンス形（`value`/`expires_at`）を最新ドキュメントで確認し、`app/api/realtime/client-secret/route.ts` を必要なら微修正。
  - ブラウザの SDP 送信先 URL（`NEXT_PUBLIC_REALTIME_BASE_URL`）と data channel の event `type` 名を確認し、`lib/realtimeClient.ts` を調整。
  - 確認: 英語を話して日本語字幕が出ること、レスポンスに標準キーが含まれないこと。

- [ ] **H-3 ZDR / Modified Abuse Monitoring の状況確認**（→ T4.3）
  - 使用組織/プロジェクトで ZDR または Modified Abuse Monitoring が承認済みか。
  - `gpt-realtime-translate` が対象エンドポイントに含まれるか。
  - 結果を `docs/privacy-data-handling.md` §6 のチェックに反映（断定表現にしない）。

- [ ] **H-4 iPhone 実機確認**（→ T5.3）
  - Safari でマイク許可 → 字幕表示 → Stop/タブ閉じで解放 → バックグラウンド復帰で再接続。
  - 本番 HTTPS 環境で確認（getUserMedia は secure context 必須）。

## 優先度: 中

- [ ] **H-5 デプロイ（Vercel）**
  - 環境変数を Vercel の暗号化シークレットに登録（`.env.local` はアップしない）。
  - 本番ドメインを `AUTH_URL` と Google リダイレクト URI、CSP の接続先に反映。

- [ ] **H-6 コスト上限/アラート設定**（→ docs/cost-estimation.md）
  - OpenAI ダッシュボードで月間ハードリミットと通知しきい値を設定（例: $50 通知 / $100 ハード）。

- [ ] **H-7 ADR-0001 の最終承認**（→ S0.4）
  - スタック・方式を承認（口頭 GO 済。ADR ステータスを「承認」に更新するか判断）。

## 優先度: 低

- [ ] **H-8 独立リポジトリ化の判断**
  - 現在 `ofarm/GitHub` ルート配置。専用リポジトリ名で切り出すかを決める。

## 完了の記録欄（人間が結果メモを残す）

- H-1: （未）
- H-2: （未）
- H-3: （未）
- H-4: （未）
