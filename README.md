# realtime-translator

自分専用のリアルタイム英→日 音声翻訳 Web アプリ（iPhone Safari / PC ブラウザ対応）。

- **目的**: 英語音声を低レイテンシで日本語にリアルタイム翻訳する、個人専用ツール。
- **方針**: 翻訳本文・音声・文字起こしを**保存しない / ログに出さない**。許可した自分のメールアドレスのみ利用可。
- **技術**: Next.js (App Router) + TypeScript + OpenAI Realtime API (`gpt-realtime-translate`) + WebRTC + Auth.js。

> ⚠️ このリポジトリは `ai.me` とは**別の独立アプリ**です。本番秘密情報・実会話ログ・APIキーをコミットしないこと。

## ドキュメント（まずここを読む）

| ファイル | 内容 |
|---|---|
| [`AGENTS.md`](./AGENTS.md) | 開発 Agent が**必ず**守るルール・禁止事項・実装手順 |
| [`docs/context-summary.md`](./docs/context-summary.md) | Agent に毎回渡す最小要約（最新決定・実装状況・次チケット） |
| [`docs/requirements.md`](./docs/requirements.md) | 要件定義（MVP / 非MVP / 受け入れ条件） |
| [`docs/architecture.md`](./docs/architecture.md) | アーキテクチャ・データフロー図・API 設計 |
| [`docs/security.md`](./docs/security.md) | セキュリティ設計・チェックリスト |
| [`docs/privacy-data-handling.md`](./docs/privacy-data-handling.md) | データ分類・保持方針・API 事業者側の残余リスク |
| [`docs/agent-strategy.md`](./docs/agent-strategy.md) | Agent 役割分担・モデル使い分け・トークン最適化・ゲート |
| [`docs/agent-prompts.md`](./docs/agent-prompts.md) | 後続 Agent にそのまま貼るプロンプト集 |
| [`docs/backlog.md`](./docs/backlog.md) | Epic / Story / Task・スプリント計画 |
| [`docs/risks.md`](./docs/risks.md) | リスク一覧（Critical〜Low） |
| [`TASKS.md`](./TASKS.md) | チケット一覧とステータス |
| [`docs/adr/`](./docs/adr/) | アーキテクチャ判断記録（ADR） |

## セットアップ

```bash
cp .env.example .env.local   # 実値を入れる（コミット禁止）
npm install
npm run dev                  # http://localhost:3000
npm run typecheck            # 型チェック
npm run test                 # 単体テスト
npm run build                # 本番ビルド
```

OAuth は Google のテスト用クライアントを作成し、`AUTH_GOOGLE_ID/SECRET` と `AUTH_SECRET`（`openssl rand -base64 32`）、`OPENAI_API_KEY`、`ALLOWED_EMAILS` を `.env.local` に設定する。

## 現状

**コア機能（字幕翻訳）が本番で動作**。認証(Auth.js+Google+allowlist)・client secret 発行・WebRTC・**英→日リアルタイム字幕**まで本番(Vercel)で動作確認済み。単体テスト 27 / typecheck / build green。秘密・本文・storage の混入なしを確認済み（`docs/security-review.md` #2）。

- **字幕メイン**。翻訳音声は既定オフ（トグルで任意再生）。
- 会議音声を拾うため getUserMedia の音声処理（エコー除去等）は無効化。
- 残: **H-3**(ZDR/データ保持の確認・`docs/privacy-data-handling.md §6.1`)、**H-4**(iPhone 実機)。詳細は `docs/human-todo.md`。

## 使い方 / つまずきポイント

1. ログイン → `/translate` → **Start** → マイク許可 → 英語音声 → 日本語字幕。
2. **マイク入力バーが 0 のまま**なら Chrome が別マイクを使用 → `chrome://settings/content/microphone` で正しいデバイスへ。
3. 会議を**ヘッドホン**で聞くとマイクが会議音声を拾えない。**スピーカー再生**にするか、将来のシステム音声取込対応を待つ。
4. 不具合時は `/translate?debug=1` で受信イベント種別・接続状態の診断パネルを表示（本文は出さない）。
