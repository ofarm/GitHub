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

## マイルストーン: MVP コア完成（2026-06-22）
- PC・**iPhone Safari の両方**で 英→日 リアルタイム字幕が本番動作（H-1/H-2/H-4 完了）。
- **併記表示**追加: 英語原文(input_transcript)と日本語訳(output_transcript)を種別で振り分け2段表示。英語表示で whisper 入力文字起こし分の課金が増える点に留意（cost-estimation 参照）。
- 残: **H-3 は方針B（ZDR/Modified Abuse Monitoring を申請）に決定・時間が取れ次第実施**（human-todo H-3）。コードは安定、セキュリティレビュー#2 済み。

## H-2 完了（2026-06-22）— 翻訳が本番で動作
- 英→日の字幕・音声ともに本番(git-hub-tan.vercel.app)で動作確認。
- 確定した実 wire: 発行=`/v1/realtime/translations/client_secrets`（cookbook 形ボディ・session.audio.output.language=ja）、SDP=`/v1/realtime/translations/calls`、翻訳テキスト=`session.output_transcript.delta`(delta)。
- 詰まりの真因は Chrome のマイク選択（OS は正常でも別デバイス）。getStats の送信レベル可視化で特定→Chrome 側でマイク変更し解決。
- 用途確定: **字幕メイン**。翻訳音声は既定オフ（トグルで任意再生）。会議の周囲音声を拾うため getUserMedia は echoCancellation/noiseSuppression/autoGainControl=false。

## フェーズ: 実用化 V1（2026-07-05 計画。詳細= docs/roadmap-v1.md）
- MVP はPC/iPhoneで動作済み。次は「会議1本を完走」のための V1.1〜V1.6。
- 実装は Haiku 級に引き継ぐ（roadmap-v1.md 末尾の運用ルールに従う。1実行=1チケット）。

## 次のチケット（最大3件）
1. V1.1 タブ切替で切断しない（Haiku可・TranslateClient.tsx のみ）。
2. V1.2 Screen Wake Lock（Haiku可）。
3. V1.5 無音自動停止 → V1.6 経過時間表示（Haiku可）。その後 V1.3/V1.4 は中モデル+人間テスト。

## 参照
要件=docs/requirements / 設計=docs/architecture / セキュリティ=docs/security / データ=docs/privacy-data-handling / 戦略=docs/agent-strategy / バックログ=docs/backlog / リスク=docs/risks / チケット=TASKS.md。
