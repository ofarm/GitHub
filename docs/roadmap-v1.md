# docs/roadmap-v1.md — 実用化ロードマップ（MVP → 毎日使える道具へ）

作成: 2026-07-05（高思考モデルによる診断・計画）。実装は軽量モデル（Haiku 級）への引き継ぎを前提にチケット化。
**各チケットは AGENTS.md の非交渉制約に従うこと（本文非保存・非ログ、キー非露出、範囲外実装禁止）。**

---

## 0. 診断 — 「動く」と「実用」のギャップ

用途 =「会議を聞きながら手元で日本語字幕を読む」。現状の MVP は動作するが、実会議（30〜60分）では次が壊れる:

| # | ギャップ | 現状の挙動 | 実害 |
|---|---|---|---|
| G1 | **タブ切替で切断** | `visibilitychange: hidden` で stop() | 会議中に資料タブを見ると翻訳が止まる（致命的） |
| G2 | **画面スリープ** | 対策なし | iPhone/Mac が数分でスリープ → セッション断 |
| G3 | **切断からの復帰** | 手動 Start のみ | Wi-Fi 瞬断・電波切替で会議の残りを失う |
| G4 | **長時間セッション** | 未検証 | Realtime セッションには最大長がある可能性（⚠️verify）。60分会議を完走できるか未確認 |
| G5 | **消し忘れ課金** | 対策なし | Stop 忘れで〜$3/時が流れ続ける |
| G6 | **ヘッドホン会議** | マイク収音のみ | PC のオンライン会議をヘッドホンで聞くと翻訳できない |
| G7 | **読みやすさ** | 固定フォント・常時追従 | 小さい字・読み返し不可・利用時間が見えない |

**結論: Phase 1（G1〜G5）を潰せば「会議1本を安心して完走」できる。Phase 2（G6〜G7）で「毎日使いたい道具」になる。**

---

## Phase 1（P0）: 会議1本を完走できる

| ID | チケット | 担当モデル | サイズ |
|---|---|---|---|
| V1.1 | タブ切替で切断しない | **Haiku可** | S |
| V1.2 | Screen Wake Lock（スリープ防止） | **Haiku可** | S |
| V1.3 | 自動再接続 | **中モデル** | M |
| V1.4 | 長時間セッション検証・上限対応 | 中モデル+**人間テスト** | M |
| V1.5 | 無音自動停止（コスト保護） | **Haiku可** | S |
| V1.6 | 経過時間・概算コスト表示 | **Haiku可** | S |

### V1.1 タブ切替で切断しない
- 内容: `app/translate/TranslateClient.tsx` の `visibilitychange → hidden → stop()` を**削除**し、解放は `pagehide` のみとする（デスクトップは裏タブでもマイク送信を継続できる。iOS はOS側で停止されるため実害なし——その場合の復帰は V1.3 が担う）。
- AC: ①PC で別タブに切替えても字幕が続く ②タブ/ウィンドウを閉じるとマイクが解放される ③既存テスト green。
- 触るファイル: `app/translate/TranslateClient.tsx` のみ。

### V1.2 Screen Wake Lock
- 内容: `navigator.wakeLock.request("screen")` を live 遷移時に取得、stop/エラー/unload で release。`visibilitychange: visible` で再取得（Wake Lock はタブ非表示で自動解放される仕様）。非対応ブラウザでは何もしない（try/catch で無害化）。
- AC: ①live 中は画面がスリープしない（人間が実機確認）②stop で解放 ③非対応環境でエラーにならない。
- 触るファイル: `lib/realtimeClient.ts` または `TranslateClient.tsx`（どちらか一方に集約）。

### V1.3 自動再接続（中モデル推奨 — 接続状態機械を触るため）
- 内容: `CONNECTION_LOST` / ICE failed 時、**自動で再接続**（新しい ek_ 取得から再実行）。最大3回・指数バックオフ（2s/4s/8s）。再接続中は「再接続中…」表示、**字幕はクリアしない**。3回失敗で現行のエラー表示にフォールバック。手動 Start はいつでも可。
- AC: ①Wi-Fi を数秒切って戻すと自動復帰し字幕が継続 ②3回失敗でエラー表示 ③再接続ループが Stop で確実に止まる ④レート制限(60秒10回)に収まる設計。
- 触るファイル: `lib/realtimeClient.ts`, `TranslateClient.tsx`。

### V1.4 長時間セッション検証・上限対応
- 内容: ⚠️verify → **確認済み(2026-07)**: Realtime セッションの最大長は現行 **60分**（過去は30分/15分の時期あり、コミュニティ報告ベース）。上限到達時は `error` イベント（`error.code` に `session_expired` を含む）が送出されることが報告されている。
- 実装済み: `lib/realtimeClient.ts` の `isSessionExpiredEvent()` がこのイベントを検知し、V1.3 の再接続機構（`handleAttemptFailure`）に "SESSION_EXPIRED" として渡す。切断を待たずに先回りして再接続を開始し、字幕は保持される。単体テスト2件（`realtimeClient.test.ts`・`realtimeClient.reconnect.test.ts`）で検証済み。
- ⚠️ 残り verify: `error.code` の正確な文字列は実 wire 未確認（コミュニティ情報ベースの推定）。検知できなくても `connectionstatechange` の失敗検知（CONNECTION_LOST）が最終的なフォールバックとして機能するため、実装の安全性には影響しない。
- AC: **60分の連続稼働テスト**（人間・実会議 or 動画で）で字幕が途切れないこと（張り直し時の数秒断は許容）。**→ 人間の実地テストが未実施のため残作業**。
- 依存: V1.3（完了）。

### V1.5 無音自動停止（コスト保護）
- 内容: 既存の `micLevel`（getStats 送信レベル）を流用し、**10分連続で無音**（レベル < 閾値）なら自動 Stop ＋「無音が続いたため停止しました」表示。定数は `lib/` に集約（`SILENCE_STOP_MINUTES = 10` 等）。
- AC: ①無音10分で停止・表示 ②会話が続く限り停止しない ③Stop 済み状態で誤発火しない。
- 触るファイル: `TranslateClient.tsx`（micLevel は既にコールバックで届いている）。

### V1.6 経過時間・概算コスト表示
- 内容: live 中に経過時間（mm:ss）と概算コスト（分 × $0.051、`docs/cost-estimation.md` の値）をステータス欄に表示。メタ情報のみ（本文と無関係）。
- AC: ①live 中カウントアップ ②Stop で停止（リセットは次回 Start）③単価は定数1箇所。
- 触るファイル: `TranslateClient.tsx`。

---

## Phase 2（P1）: 毎日使いたくなる

| ID | チケット | 担当モデル | 備考 |
|---|---|---|---|
| V2.1 | **PC タブ音声の取込**（`getDisplayMedia` の音声共有）— ヘッドホン会議対応。「マイク / タブ音声」切替UIを追加 | 中〜高モデル | G6 の解。CSP/権限/Safari非対応に注意。最重要の Phase 2 チケット |
| V2.2 | 表示設定（フォントサイズ大中小・英語併記 ON/OFF） | Haiku可 | ⚠️設定値の永続化は本文ではないが、localStorage 使用は AGENTS.md の禁止列挙に触れるため**「設定値のみ可」への改訂を人間承認**してから。承認までは非永続でよい |
| V2.3 | PWA 化（manifest・アイコン・スタンドアロン表示） | Haiku可 | **完了(2026-07-05)**。ホーム画面から1タップ起動 |
| V2.4 | レート制限のエッジ化（Vercel KV 等） | 中モデル | 依存追加 = **人間承認ゲート**。個人利用では現状でも実害小のため後回し可 |
| V2.5 | 自動スクロールの一時停止（上へスクロール中は追従停止、「最新へ」ボタン） | Haiku可 | **完了(2026-07-05・要人間の目視確認)**。読み返し用 |

### V2.3 実装メモ
- `app/manifest.ts`: name/short_name/description/start_url(`/translate`)/display=standalone/背景色・テーマ色/icons(192・512)。
- アイコンは静的画像追加ではなく `next/og` の `ImageResponse` で動的生成（新規依存なし）: `app/icon.tsx`(favicon 32x32)・`app/apple-icon.tsx`(iOS用 180x180)・`app/icon-192.png/route.tsx`・`app/icon-512.png/route.tsx`（マニフェスト用）。
- `app/layout.tsx` に `appleWebApp`(capable/statusBarStyle/title) と `viewport.themeColor` を追加し、iOS ホーム画面追加時にスタンドアロン表示（Safari の chrome 非表示）になるようにした。
- ビルド確認: `/manifest.webmanifest`・`/icon`・`/apple-icon`・`/icon-192.png`・`/icon-512.png` が全て 200・正しい content-type で応答することを `next start` 起動＋curl で確認済み。生成アイコンの見た目も目視確認済み。

## Phase 2 補遺（2026-07-14 計画・Fable5 プランニング / 実装は Sonnet5 エージェントに委任）

### B-1 【バグ】無音自動停止が実質発火しない（V1.5 の欠陥修正）
- 症状: `TranslateClient.tsx` の無音判定 effect は deps に `micLevel` を含み、cleanup で予約中のタイマーを消す。無音中でも micLevel は 0↔1↔2 と揺れるため、揺れるたびに「cleanup がタイマーを破棄 → body は `silenceStartRef` が非 null のため再予約しない」となり、10分タイマーがほぼ確実に発火前に消える。さらに setTimeout クロージャの `micLevel` は古い値（stale closure）。
- 修正方針: **render 連動の effect から切り離す**。`lastActiveAtRef`（最後に micLevel > MIC_ACTIVE だった時刻）を onDiag 経由の micLevel 更新時に ref へ記録し、live 中だけ動く**単一の周期チェック interval**（例: 10 秒毎）で `Date.now() - lastActiveAtRef.current > SILENCE_STOP_MS` を判定して自動 Stop。state/micLevel の再レンダーに影響されない。
- AC: ①無音10分（テストでは定数を短縮せず fake timer で検証可能なら尚可）で停止・SILENCE_STOP 表示 ②micLevel が低レベルで揺れても停止までの計測が途切れない ③発話で計測リセット ④Stop/再Start で誤発火なし。
- 触るファイル: `app/translate/TranslateClient.tsx`。

### V2.1 PC タブ音声の取込（ヘッドホン会議対応）— 詳細仕様
- UI: Start 前に音源を選ぶセグメント（「マイク」/「タブ音声」）。live 中は変更不可。`getDisplayMedia` 非対応（iOS Safari 等）の環境では選択肢を出さない（フィーチャーディテクト）。
- 取得: `navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })`（Chrome はタブ選択ダイアログで「タブの音声も共有」にチェックが必要。audio のみ指定はブラウザにより拒否されるため video 併用で取得し、video トラックは送信しない）。音声トラックが 0 本なら「音声が共有されていません。『タブの音声も共有』にチェックしてください」を表示して開始しない。
- 送信: 音声トラックのみ `addTrack`。video トラックは**停止しない**（停止すると共有全体が終わるブラウザがあるため保持だけする）。
- 終了系: ユーザーがブラウザ UI で共有停止 → audio トラック `ended` → 手動 Stop 相当の後片付け＋「画面共有が終了したため停止しました」表示。
- **再接続との整合（重要）**: `getDisplayMedia` はユーザー操作起点が必須のため、V1.3 の自動再接続時に再取得できない。→ `teardownConnection` を「ストリームを保持したまま接続だけ張り直す」形に拡張し（`keepStream` 引数等）、タブ音声ソースの再接続では**既存ストリームを再利用**する。トラックが既に ended なら再接続せずエラー表示。マイクソースは従来どおり再取得でよい（getUserMedia は gesture 不要）。
- AC: ①ヘッドホン装着のまま PC のタブ音声が翻訳される ②共有停止で安全に Stop ③タブ音声中の瞬断から自動復帰（共有は継続） ④マイク経路の既存動作に回帰なし（既存テスト green）。
- 触るファイル: `lib/realtimeClient.ts` / `app/translate/TranslateClient.tsx`（+必要なら `components/Controls.tsx`）。

### V2.6 E2E テスト（Playwright）
- 方針: `@playwright/test` を **devDependency** に追加（依存追加はオーナーの 2026-07-14 指示「E2Eテストも進めてください」を承認とみなす。docs/security.md の依存例外にも追記）。実行環境には Chromium がプリインストール済み（`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`、`playwright install` は実行しない）。
- スコープ（実 OAuth 鍵なしで検証できる範囲）:
  1. `/` が未認証で表示され「Google でログイン」ボタンがある。
  2. 未認証で `/translate` → `/` へリダイレクトされる。
  3. 未認証 `POST /api/realtime/client-secret` → 401。
  4. `/manifest.webmanifest` が 200・想定フィールド（start_url=/translate, display=standalone）。
  5. アイコン各ルートが 200・image/png。
  6. **認証済みフロー（セッション偽造）**: テスト用 `AUTH_SECRET`/`ALLOWED_EMAILS`（架空メール）で `next start` を起動し、`next-auth` の JWT encode でセッション cookie を生成して `/translate` を表示 → Start/Stop/Clear ボタンと字幕プレースホルダの表示を検証。さらに Start 押下で（OPENAI_API_KEY 未設定のため）SERVER_MISCONFIGURED のエラーメッセージが表示されることを確認（配線の生存確認）。**実鍵・実会話は使わない**。
- 成果物: `e2e/` ディレクトリ＋ `playwright.config.ts` ＋ `npm run test:e2e`。CI 前提はまだ不要（ローカル/エージェント実行）。
- AC: 全 E2E green ＋ 既存 unit 35 green ＋ build green。

### 実行順（エージェント割当）
```
B-1（Sonnet5・バグ修正）→ V2.1（Sonnet5・同一ファイル群のため同一実行で連続実施可）
→ V2.6（Sonnet5・独立ファイル群）
残: V2.2/V2.4（人間承認待ち）・V1.4 60分実地テスト（人間）・V2.5 目視確認（人間）
```

## Phase 3（P2）: 検討（人間の意思決定が必要）

- **V3.1 字幕の手動コピー**: 「本文を保存しない」制約と接するため、実装するなら**明示操作でクリップボードへのみ**・自動保存なし、`privacy-data-handling.md` 更新と**人間承認必須**。
- **V3.2 出力言語の切替**（ja 以外）: `TRANSLATE_TARGET_LANG` の UI 化。
- **V3.3 用語ヒント（固有名詞）**: translate モデルは**カスタムプロンプト非対応**（cookbook 明記）のため現状**不可**。モデル側の対応を待つ。

## 継続運用（スプリント外・定期）

- H-3: ZDR / Modified Abuse Monitoring 申請（既存 TODO・人間）。
- 月次: `npm audit` / 依存更新 / OpenAI Realtime 仕様・価格の変更確認（特に translate の課金単位）。
- 各リリース前: `docs/security.md` チェックリスト A〜F の再確認。

---

## Haiku 級への引き継ぎ運用（このロードマップの使い方）

1. **1回の実行 = 1チケット**。入力は次の4点のみ:
   `AGENTS.md` ＋ `docs/context-summary.md` ＋ 本ファイルの該当チケット節 ＋ 触るファイルの現物。
2. プロンプトは `docs/agent-prompts.md` の「3. チケット実装プロンプト」を使い、`{ID}` を差し替える。
3. 完了条件（全チケット共通）: `npm run typecheck` / `npm run test` / `npm run build` green ＋ 該当 AC ＋ **本文ログ・storage・キー露出なし**（`docs/security.md` チェックリスト D）。
4. **Haiku に任せないもの**: V1.3 / V1.4 / V2.1 / V2.4（接続状態機械・依存追加・権限系）→ 中モデル以上。設計変更・依存追加・AGENTS.md 改訂は人間承認。
5. 完了したら `TASKS.md` のステータスと `docs/context-summary.md` の「次のチケット」を更新（Documentation の一環として同一実行内で行ってよい）。

## 推奨実行順（最短で実用に到達）

```
V1.1 → V1.2 → V1.5 → V1.6   （Haiku で4連続・各1実行）
→ V1.3（中モデル）
→ V1.4（中モデル実装 + 人間の60分テスト）
→ ここで「実用」到達 ✅
→ V2.1（ヘッドホン会議対応・中〜高モデル）→ V2.3 → V2.5 → V2.2
```
