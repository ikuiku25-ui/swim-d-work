# SWIM D-work

競泳のコーチ1人と選手5人以下が、ドライランド（陸トレ）のメニューと実施記録をスマホで共有する PWA。

- 要件：`docs/requirements.md`
- 設計（決定事項、テーブル、RLS、通知、フェーズ）：`docs/design.md`。要件書と食い違う場合はこちらを優先する
- 仕様を変えたら、コードと同じコミットで `docs/design.md` も更新する

## 技術構成

費用ゼロで運用することが前提。有料プランや有料サービスが必要になる変更は、実装前にユーザーに相談する。

- フロントエンド：Vite + React + TypeScript、vite-plugin-pwa（injectManifest）、Tailwind CSS、TanStack Query、zod
- バックエンド：Supabase Free（Postgres、Auth、Edge Functions）
- ホスティング：Cloudflare Pages
- 定期実行：Cloudflare Workers の Cron Triggers（22時チェック。毎日の呼び出しで Supabase の一時停止も防ぐ）
- メール：Gmail SMTP（Supabase Auth の独自 SMTP として設定）
- 通知：Web Push（VAPID）
- テスト：Vitest、pgTAP（`supabase test db`）、Playwright

## ディレクトリ構成

```
src/
  features/         画面ごとのまとまり（auth, calendar, menu, record, templates, references, athletes, settings）
  lib/              supabase クライアント、日付ユーティリティ、メニューの zod スキーマ
  sw.ts             Service Worker（プッシュ受信）
supabase/
  migrations/       スキーマ・RLS・トリガー（変更は必ずマイグレーションで行う）
  functions/        Edge Functions（invite-athlete, set-athlete-status, flush-notifications, notify-menu, push-self-test, nightly-check）
  tests/            pgTAP テスト
  seed.sql          ローカル開発用のコーチ1人・選手2人
workers/
  nightly-cron/     Cloudflare Worker（毎日 UTC 13:00 に nightly-check を呼ぶ）
e2e/                画面操作の通しテスト（Playwright）
docs/
```

## 守ること

### セキュリティ
- アクセス制御はデータベース（RLS とトリガー）で強制する。画面で隠すだけの制御に頼らない
- 新しいテーブルには必ず RLS を有効にし、同じ変更で pgTAP テストを追加する。最低限「選手Aが選手Bのデータを読めない・書けない」「選手がコーチ専用テーブルに触れない」を確認する
- service role キー、VAPID 秘密鍵、SMTP のパスワードはフロントエンドのコードやリポジトリに置かない。`.env*` はコミットしない（`.env.example` だけ置く）
- 選手のメールアドレスなどの個人情報をログに出さない

### 日付と時刻
- すべて日本時間で扱う。DB は `date` 型と `time` 型。「今日」「明日」「22:00以降」は `Asia/Tokyo` を基準に判定する
- 22:00 JST の定期実行は Cloudflare の cron 式で `0 13 * * *`（UTC 13:00）

### データの決まり
- 計画（`menus`）と実績（`records`）は別テーブル。実績で計画値を上書きしない
- メニューの形式は `src/lib` の zod スキーマを正とし、DB の CHECK 制約と同じ内容に保つ
- 種目の単位は「回（reps）」と「秒（sec）」だけ。分は秒に換算して保存し、表示時に整形する
- 選手が記録を始めたら、そのメニューは変更・削除できない（判定はトリガー）
- メニューが入った枠は削除できず、中止だけできる

### 通知
- コーチ宛ての通知は、`events` のトリガーが条件を判定して送信待ち（`notifications`）に入れ、`flush-notifications` が宛先ごとに1通にまとめて送る。選手のアプリは予定を保存したら `flushNotifications()` を呼ぶ
- DB から Edge Function を直接呼ばない（DB に秘密の鍵を置かない）
- 選手宛ての通知は、コーチが「選手に通知」ボタンを押したときだけ送る。選手ごとに1通にまとめる
- 対象はドライランド枠だけ（水中練習と試合は対象外）

## 開発の進め方
- `docs/design.md` 7章のフェーズ順に進める。フェーズが終わるたびにユーザーに確認してもらう
- 各機能は「マイグレーション＋pgTAP → 画面 → 確認」の順で作る
- 日付判定・通知条件・差分表示などのロジックは、純粋関数に切り出して Vitest でテストする
- UI の文言は日本語。コード上の識別子は英語。コミットメッセージは日本語でよい
- 画面はスマホ（幅 375px 前後）を基準に作る。iPhone の Safari でホーム画面に追加して使うことを前提とする

## よく使うコマンド

```bash
npm run dev               # フロントエンド開発サーバー（http://localhost:5173）
npm test                  # Vitest
npm run lint              # oxlint
npm run build             # 型チェック＋本番ビルド
npm run test:functions    # Edge Functions のテスト（Deno が必要）
npx supabase start        # ローカル Supabase（Docker が必要）
npx supabase db reset     # マイグレーションと seed の再適用
npx supabase test db      # pgTAP（RLS テスト）
npm run test:e2e          # Playwright の画面操作テスト（ローカルの Supabase と Edge Functions が必要。各ファイルの最初に DB を seed に戻す）
```

- ログインはメールで届くコードを入力する方式（リンクは使わない。理由は `docs/design.md` 5章）
- ローカルのメールは Mailpit（http://127.0.0.1:54324）で見る。seed のユーザーは coach@example.com、athlete-a@example.com、athlete-b@example.com
- ローカルの環境変数は `.env.local`（フロントエンド）と `supabase/functions/.env`（Edge Functions）。見本は各 `.env.example`
- Edge Functions は `supabase/functions/deno.json` の設定で動く（npm の node_modules は使わない）

## デプロイ

- `main` に push すると `.github/workflows/deploy.yml` が実行される。Supabase（マイグレーション、Secrets、Edge Functions）、Cloudflare Pages、Cron 用 Worker の順に反映される
- 必要な Secrets と Variables、アカウントの準備は `docs/setup.md`、運用の手順は `docs/operations.md` を参照
- 作業はフェーズごとのブランチで行い、ユーザーの確認後に `main` に取り込む

## Claude Code のクラウド環境での注意

- Docker は止まっていることがある。`dockerd` を起動してから `npx supabase start` を実行する。イメージの取得はリトライで通ることがある
- ローカルの Edge Runtime（Docker 内）はプロキシの証明書を信頼しないため、npm のパッケージを取得できない。Edge Functions はホスト側の Deno で動かす
  - `DENO_CERT=/root/.ccr/ca-bundle.crt npx deno@2 run -A --config supabase/functions/deno.json scripts/dev-functions.ts`（全関数を http://127.0.0.1:54329/functions/v1 にまとめる）
  - `.env.local` に `VITE_FUNCTIONS_URL=http://127.0.0.1:54329/functions/v1` を書くと、画面からもそちらを呼ぶ
- ヘッドレスの Chromium にはプッシュの送信先がないため、通知の確認は「端末の代わりの受け口」（`supabase/functions/_shared/testdata` の自己署名証明書で立てた HTTPS サーバー）を購読として登録し、届いた通知を `http_ece` で復号して行う。このとき dev-functions は `NODE_TLS_REJECT_UNAUTHORIZED=0` で起動する（テスト時だけ）
