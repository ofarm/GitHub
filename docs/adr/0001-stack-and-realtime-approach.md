# ADR-0001: 技術スタックと Realtime 翻訳方式

- ステータス: 提案（人間承認待ち）
- 日付: 2026-06-22
- 決定者: オーナー（人間）

## コンテキスト
自分専用のリアルタイム英→日 音声翻訳 Web アプリ。iPhone/PC ブラウザ、低レイテンシ、許可メールのみ、本文非保存・非ログ、標準キー非露出が要件。OpenAI は 2026 年に live 翻訳専用 `gpt-realtime-translate`（per-minute 課金）と WebRTC + 短命 client secret を提供。

## 決定
- フロント/バック: Next.js(App Router)+TypeScript+React 単一アプリ。
- 認証: Auth.js(NextAuth v5)+Google OAuth、`ALLOWED_EMAILS` allowlist 認可。
- 翻訳: `gpt-realtime-translate` を WebRTC で直結。入力 en / 出力 ja。
- キー保護: サーバー API route が `POST /v1/realtime/client_secrets` で短命トークン(`ek_`, 既定 TTL120s)を発行。標準キーはブラウザに出さない。
- MVP: DB なし・履歴なし・外部監視/分析 SaaS なし。デプロイは Vercel。

## 理由
- WebRTC + ephemeral token は OpenAI 公式推奨で低レイテンシかつキー非露出。
- translate 専用モデルは英→日に最適で per-minute 課金によりコストが読みやすい。
- DB なしは「本文非保存」要件と最も整合し、攻撃面・コストを最小化。
- Vercel は Next.js+Auth.js の最短経路（HTTPS 既定・環境変数暗号化）。

## 棄却した案
- WebSocket サーバー中継: 本文がサーバーを経由しログ混入リスク増・レイテンシ増。
- ブラウザから標準キー直接: 非交渉制約違反。
- `gpt-realtime-2` に翻訳指示: 可能だがトークン課金で読みにくく重い（次点）。
- 自前 STT+翻訳 LLM 2 段: MVP に過剰。
- Cloudflare/Fly.io: 体験面で Vercel に劣後（将来移行余地として保持）。

## 影響 / 残課題
- セキュリティ: client secret 発行 API の認可・レート制限が要（R-C2）。
- データ管理: ZDR/Modified Abuse Monitoring の申請状況を要確認（R-H4, T4.3）。データ保持は断定しない。
- 未決: CSP の `connect-src` 実ホスト、レイテンシ実測、translate の ja 出力品質。

## 参照
- docs/architecture.md, docs/security.md, docs/privacy-data-handling.md, TASKS.md (S0.4)
