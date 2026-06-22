# TASKS.md — チケット一覧

ステータス: `TODO` / `DOING` / `REVIEW` / `DONE` / `BLOCKED`。
詳細・依存・優先度は `docs/backlog.md`。Agent はこのファイルを単一の真実として更新する。

## Sprint 0 — 土台
| ID | チケット | ステータス | 受け入れ条件 |
|---|---|---|---|
| S0.1 | Next.js(App Router)+TS 雛形作成（依存最小） | TODO | `npm run dev` 起動 / lint・typecheck green |
| S0.2 | `.gitignore` / `.env.example` 整備 | TODO | `.env.local` 無視 / example は実値無し |
| S0.3 | docs・AGENTS 配置確認 / README 整備 | TODO | README から各 docs に辿れる |
| S0.4 | ADR-0001 スタック確定 | TODO | 決定・理由・棄却案が記録 / 人間承認 |

## Sprint 1 — 認証・認可
| ID | チケット | ステータス | 受け入れ条件 |
|---|---|---|---|
| T1.1.1 | Auth.js + Google OAuth 設定 | TODO | 許可メールでログイン成功 / cookie が HttpOnly・Secure・SameSite=Lax |
| T1.2.1 | signIn コールバックで allowlist 照合 | TODO | 許可外はサインイン拒否（小文字化比較） |
| T1.2.2 | middleware + API での二重照合 | TODO | 未認証は `/translate`/API 拒否、許可外は 403 |
| T1.3.1 | 認証テスト（許可/不許可/未認証） | TODO | 3 ケース green |
| T1.4.1 | `/translate` 仮 UI（Start/Stop/Clear ボタンのみ） | TODO | 認証済みのみ表示 / 本文保存なし |

## Sprint 2 — Realtime 接続
| ID | チケット | ステータス | 受け入れ条件 |
|---|---|---|---|
| T2.1.1 | `POST /api/realtime/client-secret`（認証+allowlist+rate） | TODO | 未認証/許可外で 401/403、超過で 429 |
| T2.1.2 | OpenAI `client_secrets` 呼び出し（TTL120/translate/en→ja） | TODO | `ek_` のみ返す / 標準キー非露出 |
| T2.1.3 | Safety Identifier ハッシュ（メール非平文） | TODO | 送信値が平文メールでない |
| T2.2.1 | レート制限（ユーザー単位） | TODO | 超過で 429 |
| T3.1.1 | WebRTC 接続（getUserMedia+PeerConnection+data ch） | TODO | 接続確立・data ch open |
| T3.1.2 | 接続ライフサイクル状態管理 | TODO | idle→connecting→live→idle 遷移 |
| T3.2.1 | Start/Stop/Clear 実装 | TODO | Stop でマイク・接続解放、Clear で字幕消去 |
| T3.2.2 | unload/visibility での解放 | TODO | タブ閉じ/離脱で解放（iOS pagehide） |
| T3.3.1 | 日本語 delta 字幕表示（メモリのみ） | TODO | リアルタイム表示 / 保存・ログなし |
| T4.1 | ログ正規化（本文除外） | TODO | 本文・メール平文・トークンがログに出ない |
| T4.2 | storage 未使用 / build grep 確認 | TODO | storage に本文なし / バンドルに秘密なし |
| T4.3 | ZDR/Modified Abuse Monitoring 状況確認（人間） | TODO | 申請/承認状況と対象エンドポイントを記録 |

## 横断（Gate 5–7）
| ID | チケット | ステータス | 受け入れ条件 |
|---|---|---|---|
| T5.1 | セキュリティレビュー | TODO | Critical/High ゼロ / security.md 該当 ✅ |
| T5.2 | `npm audit` 対応 | TODO | high 以上を解消 or 記録 |
| T5.3 | iPhone 実機確認 | TODO | 許可・表示・解放・復帰再接続 OK |
| T5.4 | MVP リリース判定（GO/NO-GO） | TODO | 全受け入れ条件 + 全 Gate + 人間承認 |
