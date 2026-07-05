# TASKS.md — チケット一覧

ステータス: `TODO` / `DOING` / `REVIEW` / `DONE` / `BLOCKED`。
詳細・依存・優先度は `docs/backlog.md`。Agent はこのファイルを単一の真実として更新する。

## Sprint 0 — 土台
| ID | チケット | ステータス | 受け入れ条件 |
|---|---|---|---|
| S0.1 | Next.js(App Router)+TS 雛形作成（依存最小） | DONE | `npm run build`/typecheck green |
| S0.2 | `.gitignore` / `.env.example` 整備 | DONE | `.env.local` 無視 / example は実値無し |
| S0.3 | docs・AGENTS 配置確認 / README 整備 | DONE | README から各 docs に辿れる |
| S0.4 | ADR-0001 スタック確定 | REVIEW | 記録済み / 人間承認待ち（全GO受領済） |

## Sprint 1 — 認証・認可
| ID | チケット | ステータス | 受け入れ条件 |
|---|---|---|---|
| T1.1.1 | Auth.js + Google OAuth 設定 | DONE | cookie 設定は Auth.js 既定（HttpOnly/Secure/Lax）。実ログインは実OAuth鍵で人間確認 |
| T1.2.1 | signIn コールバックで allowlist 照合 | DONE | 許可外はサインイン拒否（小文字化比較・テスト緑） |
| T1.2.2 | middleware + API での二重照合 | DONE | 未認証は `/translate`/API 拒否、許可外は 403 |
| T1.3.1 | 認証テスト（allowlist 純ロジック） | DONE | 5 ケース green（allowlist）。E2E ログインは人間確認 |
| T1.4.1 | `/translate` UI（Start/Stop/Clear） | DONE | 認証済みのみ表示 / 本文保存なし |

## Sprint 2 — Realtime 接続
| ID | チケット | ステータス | 受け入れ条件 |
|---|---|---|---|
| T2.1.1 | `POST /api/realtime/client-secret`（認証+allowlist+rate） | DONE | 未認証/許可外で 401/403、超過で 429 |
| T2.1.2 | OpenAI `client_secrets` 呼び出し（TTL120/translate/出力ja） | DONE | translations/client_secrets・cookbook形ボディで本番動作確認 |
| T2.1.3 | Safety Identifier ハッシュ（メール非平文） | DONE | 送信値が平文メールでない（テスト緑） |
| T2.2.1 | レート制限（ユーザー単位） | DONE | 超過で 429（テスト緑） |
| T3.1.1 | WebRTC 接続（getUserMedia+PeerConnection+data ch） | DONE | /translations/calls・session.output_transcript.delta で本番動作確認 |
| T3.1.2 | 接続ライフサイクル状態管理 | DONE | idle→connecting→live→idle 遷移 |
| T3.2.1 | Start/Stop/Clear 実装 | DONE | Stop でマイク・接続解放、Clear で字幕消去 |
| T3.2.2 | unload/visibility での解放 | DONE | pagehide/visibilitychange で解放 |
| T3.3.1 | 日本語 delta 字幕表示（メモリのみ） | DONE | メモリ表示のみ / 保存・ログなし |
| T4.1 | ログ正規化（本文除外） | DONE | console.log 不使用・例外本文を返さない/ログしない |
| T4.2 | storage 未使用 / build grep 確認 | DONE | grep でキー/本文/storage の混入なし確認 |
| T4.3 | ZDR/Modified Abuse Monitoring 状況確認（人間） | TODO | 申請/承認状況と対象エンドポイントを記録 |

## Phase V1 — 実用化（会議1本を完走できる）※詳細= docs/roadmap-v1.md
| ID | チケット | ステータス | 担当モデル | 受け入れ条件（要約） |
|---|---|---|---|---|
| V1.1 | タブ切替で切断しない（visibilitychange の stop 撤去） | DONE | Haiku可 | 別タブでも字幕継続 / タブ閉じで解放 |
| V1.2 | Screen Wake Lock | DONE | Haiku可 | live中スリープしない / stopで解放 / 非対応で無害 |
| V1.3 | 自動再接続（最大3回・バックオフ・字幕保持） | DONE | 中モデル | 瞬断から自動復帰 / Stopで確実に停止 |
| V1.4 | 長時間セッション検証・上限対応（⚠️verify→確認済み） | REVIEW | 中+人間 | 60分連続稼働で字幕が途切れない（実装済・人間の実地テスト待ち） |
| V1.5 | 無音10分で自動停止（コスト保護） | DONE | Haiku可 | 無音で停止・表示 / 誤発火なし |
| V1.6 | 経過時間・概算コスト表示 | DONE | Haiku可 | live中カウント / 単価定数1箇所 |

## Phase V2 — 毎日使いたくなる ※詳細= docs/roadmap-v1.md §Phase 2
| ID | チケット | ステータス | 担当モデル | 受け入れ条件（要約） |
|---|---|---|---|---|
| V2.1 | PC タブ音声の取込（getDisplayMedia・ヘッドホン会議対応） | TODO | 中〜高モデル | 未着手。CSP/権限/Safari非対応に注意 |
| V2.2 | 表示設定（フォントサイズ・英語併記ON/OFF） | BLOCKED | Haiku可 | localStorage 使用の人間承認待ち。承認まで非永続実装のみ可 |
| V2.3 | PWA 化（manifest・アイコン・スタンドアロン表示） | TODO | Haiku可 | ホーム画面から1タップ起動 |
| V2.4 | レート制限のエッジ化（Vercel KV等） | BLOCKED | 中モデル | 依存追加の人間承認待ち |
| V2.5 | 自動スクロール一時停止（上スクロールで追従停止・最新へボタン） | DONE（要人間の目視確認） | Haiku可 | 読み返し中は自動追従しない / ボタンで復帰 |

## 横断（Gate 5–7）
| ID | チケット | ステータス | 受け入れ条件 |
|---|---|---|---|
| T5.1 | セキュリティレビュー | REVIEW | レビュー #1/#2 完了・Critical/High なし（docs/security-review.md）。残: 実HTTPSヘッダ/レート制限多重・H-3/H-4 |
| T5.2 | `npm audit` 対応 | REVIEW | high/critical は dev/build 依存の例外として記録（docs/security.md §18） |
| T5.3 | iPhone 実機確認 | DONE | iPhone Safari で本番ログイン→/translate→日本語字幕の表示を確認 |
| T5.4 | MVP リリース判定（GO/NO-GO） | TODO | 全受け入れ条件 + 全 Gate + 人間承認 |

> ⚠️ **人間が実鍵で確認すべき残作業**: 実 Google OAuth でのログイン E2E、OpenAI 実 wire スキーマ（client_secrets ボディ / SDP URL / event 名）の検証、iPhone 実機、ZDR 申請状況(T4.3)。Agent は実鍵を持たないため設計・配線まで完了。
