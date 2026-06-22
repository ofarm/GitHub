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

## 現状

**Gate 0（要件・制約確定）の設計フェーズ**。実装コードはまだ存在しない。
次の作業は Sprint 0（リポジトリ土台・認証方針・secrets 管理）。詳細は `TASKS.md` を参照。
