# docs/human-todo.md — 人間（オーナー）の残作業

Agent は実鍵・実データを持てないため、ここに「人間にしかできない作業」を集約する。
各項目は完了したら `[x]` にし、対応する `TASKS.md` のチケットも更新する。

> ⚠️ ここに **実 API キー・実 OAuth シークレット・実会話ログを書かない**。状態と確認結果のメモのみ。

## 優先度: 高（リリースに必須）

- [x] **H-1 実 Google OAuth セットアップ**（→ T1.1.1 / T5.3）
  - Google Cloud Console で OAuth クライアント作成。
  - リダイレクト URI: `http://localhost:3000/api/auth/callback/google`（本番は本番ドメイン）。
  - `.env.local` に `AUTH_GOOGLE_ID/SECRET`・`AUTH_SECRET`(`openssl rand -base64 32`)・`ALLOWED_EMAILS` を設定。
  - 確認: 許可メールでログイン成功、許可外メールはサインイン拒否されること。

- [x] **H-2 OpenAI 実 wire スキーマ検証 / 実翻訳**（→ T2.1.2 / T3.1.1）
  - `.env.local` に実 `OPENAI_API_KEY`、ZDR/Modified Abuse Monitoring 承認済みの組織/プロジェクト。
  - `POST /v1/realtime/client_secrets` の正確なリクエストボディ（特に translate セッション設定キー）とレスポンス形（`value`/`expires_at`）を最新ドキュメントで確認し、`app/api/realtime/client-secret/route.ts` を必要なら微修正。
  - ブラウザの SDP 送信先 URL（`NEXT_PUBLIC_REALTIME_BASE_URL`）と data channel の event `type` 名を確認し、`lib/realtimeClient.ts` を調整。
  - 確認: 英語を話して日本語字幕が出ること、レスポンスに標準キーが含まれないこと。

- [ ] **H-3 ZDR / Modified Abuse Monitoring の申請（方針: B＝申請する）**（→ T4.3）
  - 決定: 既定許容(A)ではなく、**申請して厳格化(B)** を選択。デスク作業の時間が取れ次第実施。
  - 手順: OpenAI 営業/サポート or ダッシュボードから ZDR もしくは Modified Abuse Monitoring を申請（**セルフサービス不可・承認制**）。
  - 申請時に必ず確認: **Realtime / `gpt-realtime-translate` / `gpt-realtime-whisper` が対象エンドポイントに含まれるか**。
  - 承認後: 組織/プロジェクトで有効化し、結果を `docs/privacy-data-handling.md §6.1` と下の記録欄に反映。
  - 暫定（承認までの間）: 既定（学習不使用＋最大30日 abuse 保持）で運用していることを認識しておく。

- [x] **H-4 iPhone 実機確認**（→ T5.3）
  - 手順: iPhone Safari で `https://git-hub-tan.vercel.app/` → Google ログイン → `/translate` → Start。
  - チェック: ①マイク許可ダイアログが出る ②英語を話すと「マイク入力」バーが動く ③日本語字幕が出る ④Stop でマイク解放（上部の録音インジケータが消える）⑤Safari を一度バックグラウンドにして戻ると再接続できる（必要なら Start し直し）。
  - 注意: getUserMedia は secure context 必須（本番 HTTPS なのでOK）。iOS は Start タップ起点でのみマイク取得可。会議音声を拾うには iPhone をスピーカー音源の近くに置く（ヘッドホン利用時は不可）。
  - うまくいかない場合は `/translate?debug=1` の診断パネル（#micLevel など）を確認。

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

- H-1: ✅ 2026-06-22 本番 https://git-hub-tan.vercel.app/ で Google ログイン→/translate 到達を確認。allowlist 認可が本番動作。
- H-2: ✅ 2026-06-22 英語→日本語の字幕・音声ともに本番動作を確認。発行ボディは cookbook 形に修正、SDP は /translations/calls。詰まり原因は Chrome のマイク選択（OSは正常でも別デバイス）→ Chrome 側でマイク変更で解決。
- H-4: ✅ 2026-06-22 iPhone Safari で本番URLにログイン→/translate→日本語字幕の表示を確認。PC/iPhone 両対応を達成。
- H-3: （未）
- H-4: （未）
