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
- Gate 0〜3 の実装が一巡。Next.js+Auth.js+allowlist+client secret 発行API+WebRTC配線+字幕UI まで実装済み。
- 検証: typecheck green / build green / 単体テスト 12 緑 / 秘密・本文・storage 混入なし（grep 確認）。
- **Agent 側で完了できない残作業**（実鍵が必要・Agent には渡さない）:
  - 実 Google OAuth でのログイン E2E（T5.3 系）。
  - OpenAI 実 wire スキーマ検証: `client_secrets` ボディ / translate セッション設定 / SDP 送信先 URL / event type 名（コード内 `⚠️ verify` 箇所）。
  - iPhone 実機確認、ZDR/Modified Abuse Monitoring 申請状況(T4.3)。
- audit: dev/build 推移依存の例外を docs/security.md §18 に記録。

## 次のチケット（最大3件）
1. T4.3: ZDR/Modified Abuse Monitoring の申請・対象エンドポイント確認（人間）。
2. T2.1.2/T3.1.1 の `⚠️ verify` 箇所を実鍵で検証（人間 or 鍵保有環境）。
3. T5.1 セキュリティレビュー → T5.3 実機 → T5.4 リリース判定。

## 参照
要件=docs/requirements / 設計=docs/architecture / セキュリティ=docs/security / データ=docs/privacy-data-handling / 戦略=docs/agent-strategy / バックログ=docs/backlog / リスク=docs/risks / チケット=TASKS.md。
