# docs/backlog.md — バックログとスプリント計画

優先度: P0=MVP 必須最短ルート / P1=MVP 内だが後回し可 / P2=非 MVP。
推奨モデル: H=高思考 / M=中 / L=軽量。サイズ: S/M/L（相対）。

## Epic 一覧
- **E1 認証・認可基盤**（P0）
- **E2 Realtime 接続・client secret**（P0）
- **E3 翻訳 UI・WebRTC**（P0）
- **E4 プライバシー/ログ統制**（P0）
- **E5 セキュリティ・リリース**（P0）
- **E6 拡張**（P2: 履歴・TTS・双方向など。MVP 対象外）

## Story / Task

### E1 認証・認可（Sprint 1）
- **S1.1 OAuth ログイン** — As 自分, OAuth でログインしたい。
  - T1.1.1 Auth.js 設定（Google）`L/M/S` — 担当: 実装。依存: Sprint0。Sec影響:高。
  - AC: 許可メールでログイン成功、セッション cookie が HttpOnly/Secure/SameSite。
- **S1.2 allowlist 認可**
  - T1.2.1 signIn コールバックで `ALLOWED_EMAILS` 照合 `L/M/S` — Sec影響:高。
  - T1.2.2 middleware + API での二重照合 `L/M/S`。
  - AC: 許可外はサインイン拒否、未認証は `/translate`/API 拒否。
- **S1.3 認証テスト** — T1.3.1 許可/不許可/未認証テスト `Test/M/S`。

### E2 client secret（Sprint 2）
- **S2.1 発行 API**
  - T2.1.1 `POST /api/realtime/client-secret`（認証+allowlist+rate）`M/M/M` — 依存:E1。Sec影響:Critical。
  - T2.1.2 OpenAI `client_secrets` 呼び出し（Safety-Id ハッシュ、TTL120、translate/en→ja）`M/M/M`。
  - T2.1.3 Safety Identifier ハッシュ実装 `L/M/S`。
  - AC: 標準キー非露出、`ek_` のみ返す、401/403/429 分岐。データ影響:発行メタのみ。
- **S2.2 レート制限** — T2.2.1 ユーザー単位簡易制限 `L/L/S`。

### E3 翻訳 UI（Sprint 2）
- **S3.1 WebRTC 接続**
  - T3.1.1 getUserMedia + PeerConnection + data channel `H設計/M実装/L` — 依存:E2。
  - T3.1.2 接続ライフサイクル状態管理 `M/M`。
  - AC: 英→日字幕がリアルタイム表示。
- **S3.2 コントロール** — T3.2.1 Start/Stop/Clear `L/L/S`、T3.2.2 unload/visibility 解放 `M/M/S`。
  - AC: Stop/タブ閉じでマイク・接続解放。
- **S3.3 字幕表示** — T3.3.1 delta 逐次表示（メモリのみ）`L/L/S`。Data影響:本文を保存/ログしない。

### E4 プライバシー/ログ（横断, Gate4）
- T4.1 ログ正規化（本文除外）`M/M/S` — Sec/Data影響:高。
- T4.2 storage 未使用・ビルド grep 確認 `Test/M/S`。
- T4.3 ZDR/Modified Abuse Monitoring 状況確認（人間）`-/-/S`。

### E5 セキュリティ/リリース（Gate5–7）
- T5.1 セキュリティレビュー `Sec/H/M`。
- T5.2 `npm audit` 対応 `L/L/S`。
- T5.3 iPhone 実機確認（人間+実装）`-/M/M`。
- T5.4 リリース判定 `Release/H/S`。

## 最短ルート（MVP クリティカルパス）
Sprint0 土台 → T1.1.1 → T1.2.1 → T1.2.2 → T1.3.1（認証 green）→ T2.1.1〜2.1.3 → T2.2.1（発行 API）→ T3.1.1 → T3.1.2 → T3.2.x → T3.3.1（翻訳動作）→ T4.1/T4.2（非保存/非ログ実証）→ T5.1/T5.2 → T5.3 実機 → T5.4 GO。

---

## J. 最初の 3 スプリント計画

### Sprint 0 — 土台
- 目的: リポジトリ土台 / 認証方針 / docs 土台 / secrets 管理。
- チケット: Next.js 雛形作成、`.gitignore`/`.env.example` 整備、AGENTS/docs 配置確認、README、ADR-0001（スタック確定）。
- 成果物: 初期 Next.js 構成、AGENTS.md、docs 一式、`.env.example`、README、認証方針（Auth.js+Google+allowlist）確定。
- 受け入れ: `npm run dev` 起動、lint/typecheck green、秘密未コミット。
- テスト: ビルド/lint。
- リスク: 雛形に不要依存が増える → 最小構成を厳守。
- 人間確認: スタック確定 ADR の承認、OAuth クライアント作成。

### Sprint 1 — 認証・認可
- 目的: 認証/認可、allowlist、翻訳画面の仮 UI、未認証アクセス制御。
- チケット: T1.1.1, T1.2.1, T1.2.2, T1.3.1、`/translate` 仮 UI（Start/Stop/Clear ボタンのみ）。
- 成果物: ログイン、`/translate`（仮 UI）、未認証ガード、認証テスト。
- 受け入れ: 許可メールのみ入室、未認証/許可外は拒否。
- テスト: 認証 3 ケース、ガード。
- リスク: allowlist 照合漏れ → 二重照合で防止。
- 人間確認: 自分のメールが allowlist にあるか、OAuth リダイレクト URL。

### Sprint 2 — Realtime 接続
- 目的: client secret 発行 + WebRTC + 日本語字幕。
- チケット: T2.1.1–2.1.3, T2.2.1, T3.1.1–3.1.2, T3.2.x, T3.3.1, T4.1。
- 成果物: `/api/realtime/client-secret`、短命 client secret、ブラウザ WebRTC、delta 字幕、Stop でマイク解放、本文ログ禁止確認。
- 受け入れ: 英→日字幕リアルタイム、標準キー非露出、解放動作、本文非ログ。
- テスト: 発行 API 認可/レスポンス、状態遷移、ログ grep。
- リスク: iOS Safari の解放/権限、CSP の connect-src、レイテンシ。
- 人間確認: 実機マイク許可、ZDR 状況、connect-src の実ホスト。
