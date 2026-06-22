# docs/context-summary.md — Agent に毎回渡す最小要約

> このファイルは「毎回 Agent に渡す唯一の要約」。1 画面に収める。変更のたび Documentation Agent が更新。**秘密情報・本文を書かない。**

## プロダクト
自分専用のリアルタイム英→日 音声翻訳 Web アプリ。iPhone Safari / PC ブラウザ。低レイテンシ。許可メールのみ利用可。本文（音声/transcript/翻訳）を保存・ログ・storage に残さない。

## 確定している決定（変更は人間承認が必要）
- スタック: Next.js(App Router)+TS+React、Auth.js(NextAuth v5)+Google OAuth、allowlist 認可。
- 翻訳: OpenAI Realtime `gpt-realtime-translate`、WebRTC 直結、入力 en/出力 ja、per-minute 課金。
- 標準 API キーはサーバーのみ。ブラウザには短命 client secret(`ek_`, TTL120s) のみ。
- 発行 API: `POST /api/realtime/client-secret`（認証+allowlist+rate、Safety-Id はメールのハッシュ）。
- MVP: DB なし・履歴なし・外部分析/監視 SaaS なし。デプロイは Vercel。
- データ保持は断定しない。ZDR/Modified Abuse Monitoring は申請制（要確認）。

## 非交渉制約（詳細は AGENTS.md）
標準キー非露出 / NEXT_PUBLIC_ に秘密禁止 / 本文を保存・ログ・console・storage 禁止 / 認証+allowlist 必須 / 履歴・DB・外部 SaaS を MVP に足さない / チケット範囲外・アーキ変更禁止 / 実データ不使用。

## 現在の状況
- Gate 0（要件・制約確定）完了：docs 一式・AGENTS・TASKS 作成済み。実装コードはまだ無し。
- 次は Sprint 0（リポジトリ土台）→ Sprint 1（認証）。

## 次のチケット（最大3件）
1. Sprint0: Next.js 雛形・`.gitignore`・最小構成（依存最小）。
2. T1.1.1: Auth.js + Google OAuth 設定。
3. T1.2.1/1.2.2: allowlist 二重照合。

## 参照
要件=docs/requirements / 設計=docs/architecture / セキュリティ=docs/security / データ=docs/privacy-data-handling / 戦略=docs/agent-strategy / バックログ=docs/backlog / リスク=docs/risks / チケット=TASKS.md。
