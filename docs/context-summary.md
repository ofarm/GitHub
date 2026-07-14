# docs/context-summary.md — Agent に毎回渡す最小要約

> このファイルは「毎回 Agent に渡す唯一の要約」。1 画面に収める。変更のたび Documentation Agent が更新。**秘密情報・本文を書かない。**

## プロダクト
自分専用のリアルタイム英→日 音声翻訳 Web アプリ。iPhone Safari / PC ブラウザ。低レイテンシ。許可メールのみ利用可。本文（音声/transcript/翻訳）を保存・ログ・storage に残さない。

## 確定している決定（変更は人間承認が必要）
- スタック: Next.js(App Router)+TS+React、Auth.js(NextAuth v5)+Google OAuth、allowlist 認可。
- 翻訳: OpenAI Realtime `gpt-realtime-translate`、WebRTC 直結、出力 ja（入力は自動判定）、per-minute 課金。
- 上流エンドポイント（translate 専用・cookbook 準拠）: 発行=`/v1/realtime/translations/client_secrets`、SDP 交換=`/v1/realtime/translations/calls`（model は ek_ に束縛、`?model=` 不要）。発行ボディは `{ expires_after, session:{ model, audio:{ input:{ transcription:{model:"gpt-realtime-whisper"}, noise_reduction:{type:"near_field"} }, output:{ language:"ja" } } } }`（`session.type` は付けない＝付けると 400）。
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

## 検証状況（2026-06-22 更新）
- 単体テスト **27件 green**（allowlist/safetyId/rateLimit/delta抽出/レスポンスパーサ/**route認可**）。typecheck・build green。
- Gate 5 静的セキュリティレビュー #1 完了（Critical/High なし）→ `docs/security-review.md`。
- 人間の残作業は `docs/human-todo.md`（H-1〜H-8）に集約。

## マイルストーン: Phase 1 コード実装完了（2026-07-05）
- **V1.1-V1.6 の 6 つのチケットすべてコード実装完了** ✅（V1.4 のみ人間の実地テスト待ちで REVIEW）
  - V1.1: タブ切替で翻訳が切断されない（pagehide のみで解放）
  - V1.2: Screen Wake Lock（live 中にスリープしない）
  - V1.3: **自動再接続**（中モデルで実装完了）。CONNECTION_LOST/ICE failed で最大3回・指数バックオフ(2s/4s/8s)・字幕保持のまま復帰。手動 Stop で即座に再接続ループを打ち切り。単体テスト3件で状態遷移を検証済み（`lib/realtimeClient.reconnect.test.ts`）。
  - V1.4: **長時間セッション検証**（REVIEW）。Web調査でセッション最大長=60分・上限到達時 `error.code: session_expired` の報告を確認（コミュニティ情報ベース・実wire未確認）。`isSessionExpiredEvent()` がこれを検知し V1.3 の再接続機構を流用して先回り再接続する実装を追加済み。**残作業: 人間による実会議60分連続稼働テスト**（human-todo に追加予定）。
  - V1.5: 無音 10 分で自動停止（コスト保護）
  - V1.6: 経過時間（mm:ss）と概算コスト表示（$cost_per_minute 定数化）

## H-2 完了（2026-06-22）— 翻訳が本番で動作
- 英→日の字幕・音声ともに本番で動作確認。
- 確定した実 wire: 発行=`/v1/realtime/translations/client_secrets`、SDP=`/v1/realtime/translations/calls`、翻訳テキスト=`session.output_transcript.delta`。
- 用途確定: **字幕メイン**。翻訳音声は既定オフ（トグルで任意再生）。会議の周囲音声を拾うため音声処理無効化。

## Phase 2 進捗（2026-07-14 更新）
- **V2.3 PWA化 完了** ✅（manifest + 動的生成アイコン一式・新規依存なし・curl/目視確認済み）。
- **V2.5 自動スクロール一時停止 完了**（要人間の目視確認）。
- **B-1 修正完了** ✅: V1.5 の無音自動停止が effect churn でタイマー消滅し実質発火しないバグ。lastActiveAtRef + live 中のみの周期 interval（10秒毎）方式に置換（Sonnet5 エージェント実装）。
- **V2.1 タブ音声取込 完了** ✅（Sonnet5 エージェント実装・Fable5 レビュー済）: 「マイク/タブ音声」切替UI（getDisplayMedia 対応環境のみ表示）。取得は Start の click スタック内（ユーザー操作起点必須のため）。video トラックは保持のみ・音声のみ送信。共有停止(ended)で安全停止。**再接続は既存ストリーム再利用**（teardownConnection の keepStream）。エラーコード: DISPLAY_NO_AUDIO / DISPLAY_START_FAILED / DISPLAY_SHARE_ENDED。
- **B-2 修正完了** ✅（Fable5 レビューで発見）: 接続前の早期失敗（client secret 失敗等）で渡し済みタブ共有ストリームが解放されないリーク → teardownConnection で providedStream も解放。回帰テスト追加。
- 単体テスト **39件 green**（reconnect系9件含む）。
- V2.2/V2.4 は人間承認（localStorage方針・依存追加）待ちで BLOCKED。
- **V2.6 E2E（Playwright）完了** ✅: `npm run test:e2e` で 7/7 green。未認証3件（/表示・/translate リダイレクト・API 401）＋PWA3件（manifest・アイコン2）＋認証済み1件（**セッション cookie 偽造**で /translate 表示 → Start → SERVER_MISCONFIGURED 表示の配線確認）。実キー・実メール不使用（架空値のみ、`e2e/testEnv.ts`）。@playwright/test 1.56.1（プリインストール Chromium rev1194 一致）を devDependency 追加（security.md §18 に記録）。

## 自動化可能な作業は完了（2026-07-14）— 残りは人間の作業
1. **H-9: V1.4 の実会議60分連続稼働テスト**。
2. **H-10: V2.1 タブ音声の実ブラウザ確認**（共有チェック・共有停止・瞬断復帰）＋ V2.5 目視。
3. H-3: ZDR/Modified Abuse Monitoring 申請（既存）。
4. 承認待ち: V2.2（localStorage 設定値のみ可への AGENTS.md 改訂）/ V2.4（Vercel KV 依存追加）。

## 参照
要件=docs/requirements / 設計=docs/architecture / セキュリティ=docs/security / データ=docs/privacy-data-handling / 戦略=docs/agent-strategy / バックログ=docs/backlog / リスク=docs/risks / チケット=TASKS.md。
