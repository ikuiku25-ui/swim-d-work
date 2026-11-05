# 本番環境の準備手順（フェーズ0）

アカウント作成と設定は、本人の操作が必要なので手作業で行う。どのサービスも無料プランで、クレジットカードの登録はいらない。

最後に GitHub に鍵を登録すれば、それ以降は `main` に変更が入るたびに GitHub Actions が自動でデプロイする。

所要時間の目安は 40〜60 分。

---

## 1. Supabase（データベース・ログイン・サーバー処理）

1. https://supabase.com で「Start your project」を押し、GitHub アカウントでサインアップする
2. 「New project」でプロジェクトを作る
   - Name：`swim-d-work`
   - Database Password：「Generate a password」で作り、**どこかに控える**（あとで GitHub に登録する）
   - Region：**Northeast Asia (Tokyo)**
   - Plan：Free
3. 作成が終わったら、次の3つを控える
   - **Project URL** と **Project ref**：Project Settings → Data API（URL が `https://abcdefgh.supabase.co` なら、ref は `abcdefgh`）
   - **Publishable key**：Project Settings → API Keys の `sb_publishable_...`（公開してよい鍵）
4. **アクセストークン**を作る：右上のアイコン → Account preferences → Access Tokens → 「Generate new token」（名前は `github-actions`）。表示された `sbp_...` を控える
5. **新規登録を止める**：Authentication → Sign In / Providers → 「Allow new users to sign up」をオフにして保存
   - 選手はコーチの招待でだけ登録できるようにするため

## 2. Gmail（ログイン用メールの送信元）

Supabase の標準のメール送信は、Supabase に登録したメンバー以外には届かない。そのため Gmail から送る設定をする。

1. コーチの Google アカウントで **2段階認証**をオンにする（https://myaccount.google.com/security）
2. https://myaccount.google.com/apppasswords で**アプリパスワード**を作る（名前は `SWIM D-work`）。表示された16文字を控える
3. Supabase の Authentication → Emails → SMTP Settings で「Enable custom SMTP」をオンにし、次のように入力する

   | 項目 | 値 |
   | --- | --- |
   | Sender email | コーチの Gmail アドレス |
   | Sender name | SWIM D-work |
   | Host | smtp.gmail.com |
   | Port | 465 |
   | Username | コーチの Gmail アドレス |
   | Password | 手順2のアプリパスワード（空白を除いた16文字） |

4. **送信テスト**：Authentication → Users → 「Add user」→「Send invitation」で、自分の別のメールアドレス（家族のものなど）に招待を送る。メールが届けば成功
   - テストで作ったユーザーは、確認後に「Delete user」で削除する

## 3. Cloudflare（アプリの公開と毎晩22時の定期実行）

1. https://dash.cloudflare.com/sign-up でアカウントを作る（Free）
2. **Account ID** を控える：ダッシュボードのトップで「Workers & Pages」を開くと右側に表示される
3. **API トークン**を作る：右上のアイコン → Profile → API Tokens → 「Create Token」
   - テンプレート「Edit Cloudflare Workers」を選ぶ
   - Permissions に行を追加：`Account` / `Cloudflare Pages` / `Edit`
   - Account Resources：自分のアカウント
   - 作成後に表示されるトークンを控える（一度しか表示されない）

## 4. GitHub に鍵を登録する

リポジトリ https://github.com/ikuiku25-ui/swim-d-work の Settings → Secrets and variables → Actions で登録する。

VAPID 鍵（プッシュ通知用）と CRON_SECRET は、Claude が作成して「本番用の鍵.txt」に書き出してある。

**Secrets タブ**（秘密の値。登録後は見られない）

| 名前 | 値 |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | 1-4 の `sbp_...` |
| `SUPABASE_DB_PASSWORD` | 1-2 のデータベースパスワード |
| `VAPID_PRIVATE_KEY` | 本番用の鍵.txt |
| `CRON_SECRET` | 本番用の鍵.txt |
| `CLOUDFLARE_API_TOKEN` | 3-3 のトークン |
| `CLOUDFLARE_ACCOUNT_ID` | 3-2 の Account ID |

**Variables タブ**（公開してよい値）

| 名前 | 値 |
| --- | --- |
| `SUPABASE_PROJECT_REF` | 1-3 の Project ref |
| `VITE_SUPABASE_URL` | 1-3 の Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | 1-3 の `sb_publishable_...` |
| `VITE_VAPID_PUBLIC_KEY` | 本番用の鍵.txt |
| `VAPID_SUBJECT` | `mailto:` + コーチの Gmail アドレス（例：`mailto:coach@gmail.com`） |

## 5. デプロイする

1. 登録が終わったら Claude に伝える。フェーズ0のブランチを `main` に取り込むと、デプロイが自動で始まる
   - すでに `main` に入っている場合は、GitHub の Actions → Deploy → 「Run workflow」で手動実行する
2. Actions 画面で Deploy の3つのジョブ（supabase / web / cron-worker）がすべて緑になれば成功
3. **アプリの URL を確認する**：Cloudflare の Workers & Pages → `swim-d-work` に表示される URL（通常は `https://swim-d-work.pages.dev`。名前が使われていると末尾が変わる）
4. Supabase の Authentication → URL Configuration に URL を登録する
   - Site URL：手順3の URL
   - Redirect URLs：手順3の URL の末尾に `/**` を付けたもの（例：`https://swim-d-work.pages.dev/**`）

## 6. iPhone で通知テスト

1. iPhone の Safari で `（アプリの URL）/dev/push` を開く
2. 共有ボタン（□に↑）→「ホーム画面に追加」→「追加」
3. **ホーム画面の「D-work」アイコンから開く**（Safari のままでは通知を使えない）
4. 画面の「判定」が「通知を使えます」になっていることを確認する
5. 「1. 通知を許可して購読」→ 許可のダイアログで「許可」
6. 「2. 端末内でテスト表示」→ 通知が出れば、表示まわりは OK
7. 「3. サーバーから送信（10秒後）」を押し、**すぐにホーム画面に戻ってアプリを閉じる** → 10秒ほどで通知が届けば成功
8. 届いた通知をタップすると、アプリの通知テスト画面が開く

うまくいかないときは、画面下の記録（× で始まる行）をスクリーンショットして Claude に送る。

## 7. 22時の定期実行を確認する（翌日でよい）

- 22時を過ぎたら、Cloudflare の Workers & Pages → `swim-d-work-nightly-cron` → Logs（または Metrics）で実行記録を見る
- `nightly-check ok` が出ていれば成功。この呼び出しが毎日あるので、Supabase の一時停止も防げる

---

# フェーズ1で追加する本番設定

## 8. ログインメールの文面を日本語にする

ログインは、メールで届くコードをアプリに入力する方式にした。メールにコードが載るよう、文面を差し替える。

1. Supabase の Authentication → Emails → Templates タブ → **Magic Link** を開く
2. **Subject** に `SWIM D-work ログインコード` と入れる
3. **Body**（Source）の中身をすべて消し、リポジトリの `supabase/templates/magic_link.html` の中身を貼り付ける
4. 「Save changes」で保存する

## 9. コーチのアカウントを作る

最初に作ったユーザーが自動的にコーチになる。そのため、**選手より先に**コーチを作る。

1. Authentication → Users を開く。フェーズ0の送信テストで作ったユーザーが残っていれば、先に削除する
2. 「Add user」→ **「Create new user」** を選ぶ
   - Email address：コーチのメールアドレス
   - Password：適当な長い文字列（ログインには使わないので、控えなくてよい）
   - **Auto Confirm User にチェック**を入れる
3. 「Create user」で作成する
4. アプリ（https://swim-d-work.pages.dev ）を開き、コーチのメールアドレスを入れて「ログイン用のコードを送る」→ メールのコードを入力する
5. 「選手管理」が表示されればコーチとしてログインできている

## 10. 選手を招待する

1. コーチでログインし、「選手管理」で選手の名前とメールアドレスを入れて「招待メールを送る」
2. 選手に「SWIM D-work ログインコード」のメールが届く。メールの「はじめて使う方へ」の手順で、ホーム画面に追加してログインしてもらう
3. コードの有効期限（1時間）が切れていたら、選手がログイン画面で「ログイン用のコードを送る」を押せば、新しいコードが届く
