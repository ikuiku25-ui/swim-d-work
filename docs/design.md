# SWIM D-work 設計書

要件は `docs/requirements.md`。この文書は、要件定義後の確認で決めた事項と、データベース・権限・通知・実装フェーズの設計をまとめたもの。要件書と食い違う場合はこの文書を優先する。

## 1. 要件確認で決まった事項

| No | 論点 | 決定 |
| --- | --- | --- |
| Q1 | 記録開始後のメニュー変更 | 選手が記録を始めたら、コーチはそのメニューを変更・削除できない（ロック） |
| Q2 | 選手への通知タイミング | 自動では送らない。コーチが「選手に通知」ボタンを押したときに送る（下記 4章） |
| Q3 | 「実施済み」の印 | 選手が実施画面で「完了」を押したとき。チェックが1つ以上あって完了前なら「実施中」。未チェックが残っていても完了でき、未チェック分はコーチ画面で強調 |
| Q4 | コーチ通知の重複 | 1回の操作で送るコーチ通知は最大1通（下記 4章の条件表） |
| Q5 | 「変更あり」表示 | メニュー設定後の変更だけが対象。表示は「最初の値 → 最新の値」。コーチが「確認済み」を押すと消える |
| Q6 | 種目の単位 | 「回」と「秒」の2択。5分は300秒として入力・保存する（表示は下記 6章） |
| Q7 | 単独ブロックのセット数 | 実績で修正できる。ブロック単位で実施セット数を1つ持つ（サーキットの実施周回数と同じ扱い） |
| Q8 | 種目削除時の確認 | Q1 により記録がある種目は削除できないため、記録後の確認ダイアログは不要。記録開始前は通常どおり削除できる |
| Q9 | 一括貼り付け先にメニューがある場合 | 一覧で「設定済み」と表示し、上書きするかを選ぶ（初期は未選択）。記録が始まった枠は選べない |
| Q10 | 中止の取り消し | 「通常」に戻せる。中止理由は履歴として残す |
| Q11 | 実績の修正期限 | 期限なし（自分の分のみ） |
| Q12 | 選手の通知設定 | 選手カレンダーのメニューに「通知を有効にする」を置く（独立した画面は作らない） |
| Q13 | 停止した選手 | 停止を解除できる。コーチカレンダーでは初期状態で非表示、絞り込みで表示 |
| Q14 | 技術選定 | 費用ゼロで運用できる構成にする（下記 2章） |
| Q15 | iPhone の対応バージョン | iOS 16.4 以上。それ未満の端末には案内文を表示 |

### Q1 の「記録開始」の定義

選手の操作で次のどれかが記録された時点を「記録開始」とする。

- 種目のチェックが1つ以上ある
- 実績値（回数・秒数・負荷・セット数・周回数）を計画値から1つ以上変更した
- 種目を追加した
- 「完了」を押した

画面を開いただけ、チェックを付けてすぐ外しただけ（すべて計画どおりで、チェックも追加もない状態）はロックしない。ロックはデータベースのトリガーで強制する。

## 2. 技術構成（無料枠で運用）

| 要素 | 採用 | 無料枠での注意点 |
| --- | --- | --- |
| フロントエンド | Vite + React + TypeScript、vite-plugin-pwa（injectManifest 方式で独自の Service Worker） | — |
| UI | Tailwind CSS | — |
| データ取得 | @supabase/supabase-js、TanStack Query | — |
| 入力検証 | zod（メニュー JSON の形式もここで定義） | — |
| ホスティング | Cloudflare Pages（`*.pages.dev` を使い、独自ドメインは取らない） | 無料 |
| 定期実行 | Cloudflare Workers の Cron Triggers（22時チェック用の小さな Worker） | 無料。毎日 Supabase にアクセスするので、Supabase の一時停止対策も兼ねる |
| バックエンド | Supabase Free プラン（Postgres、Auth、Edge Functions、pg_net、Vault） | 1週間アクセスがないとプロジェクトが一時停止する。22時チェックの毎日の呼び出しで防ぐ |
| メール送信 | Gmail の SMTP（アプリパスワード）を Supabase Auth の独自 SMTP に設定 | Supabase の標準メールは組織メンバー以外に送れないため、独自 SMTP が必須。Gmail は1日の送信上限があるが、この人数なら十分 |
| プッシュ通知 | Web Push（VAPID 鍵は自前で生成） | 無料 |
| テスト | Vitest（ロジック）、pgTAP（RLS とトリガー）、Playwright（画面操作） | — |
| デプロイ | GitHub Actions（`main` への push で Supabase・Cloudflare に自動反映。鍵は GitHub Secrets / Variables に置く） | 無料 |

## 3. テーブル設計

日付と時刻は日本時間の `date` 型と `time` 型で保存する（タイムゾーン変換をしない）。「今日」「明日」「22:00以降」の判定は、データベースでは `now() at time zone 'Asia/Tokyo'` を基準にする。

| テーブル | 主な列 | 書き込める人 |
| --- | --- | --- |
| `profiles` | `id`（= auth.users.id）、`role`（coach / athlete）、`display_name`、`color`、`is_active` | コーチ（招待・停止は Edge Function 経由） |
| `events`（予定枠） | `id`、`athlete_id`、`kind`（dryland / swim / meet）、`date`、`start_time`、`place`、`duration_min`、`status`（normal / canceled）、`cancel_reason`、`changed_from`（jsonb：メニュー設定後の最初の日付・時刻・場所・時間）、`change_ack_at`、`completed_at`、`created_at`、`updated_at` | 選手本人 |
| `event_cancel_history` | `event_id`、`reason`、`canceled_at`、`restored_at` | トリガーが自動で記録 |
| `menus`（計画） | `event_id`（主キー、1枠に1つ）、`blocks`（jsonb）、`updated_at`、`notified_at` | コーチ |
| `records`（実績） | `event_id`（主キー）、`exercise_results`（jsonb：種目IDごとの checked・実績値・負荷）、`block_results`（jsonb：ブロックIDごとの実施セット数・実施周回数）、`added_exercises`（jsonb）、`started`（bool、トリガーが計算） | 選手本人 |
| `templates` | `id`、`title`、`blocks`（jsonb、menus と同じ形式）、`reference_note_id` | コーチ |
| `reference_notes`（参考メニュー帳） | `id`、`title`、`url`、`memo`、`tags text[]` | コーチ |
| `exercise_names`（種目名の候補） | `name`（一意）、`last_used_at` | menus・templates 保存時のトリガー |
| `push_subscriptions` | `user_id`、`endpoint`（一意）、`p256dh`、`auth`、`user_agent` | 本人 |
| `notification_log` | `recipient_id`、`kind`、`body`、`sent_at`、`error` | Edge Function のみ（不具合の調査用） |

### メニュー JSON の形式（menus.blocks / templates.blocks）

```jsonc
[
  { "id": "uuid", "type": "single", "sets": 3, "rest_sec": 60, "memo": "",
    "exercise": { "id": "uuid", "name": "懸垂", "value": 8, "unit": "reps", "load": "自重", "memo": "" } },
  { "id": "uuid", "type": "circuit", "rounds": 3, "rest_between_exercises_sec": 15, "rest_between_rounds_sec": 90, "memo": "",
    "exercises": [ { "id": "uuid", "name": "スクワット", "value": 15, "unit": "reps", "load": "自重", "memo": "" } ] }
]
```

- `unit` は `reps`（回）か `sec`（秒）のどちらか
- ブロックと種目には UUID を付け、実績はその UUID と紐づける
- 形式は zod のスキーマを正とし、データベース側にも同じ内容の CHECK 制約（検証関数）を置く

### 設計判断

- 計画（menus）と実績（records）は書く人が違うので、別テーブルにする。権限をテーブル単位で分けられ、計画値の上書きも構造上起こらない
- メニュー本体は jsonb で持つ。並び替えや入れ子を1回の更新で保存できる

## 4. 通知

### コーチ宛て（自動、即時）

`events` の AFTER トリガーが条件を判定し、pg_net で Edge Function `push-send` を呼ぶ。対象はドライランド枠だけ。1回の操作で送るのは最大1通。

| 対象の枠 | 操作 | 通知 |
| --- | --- | --- |
| メニュー未設定 | 「締切後」の日付に追加・移動（締切後 = 前日22:00以降の翌日分、または当日分） | 送る（「追加されました（メニュー未設定）」） |
| メニュー未設定 | 締切前の追加・変更・中止・削除 | 送らない（22時のチェックで拾う） |
| メニュー設定済み | 変更・中止（日時を問わない） | 送る（「変更されました」「中止されました（理由：…）」） |

### コーチ宛て（毎晩22:00）

Cloudflare Workers の Cron Trigger（`0 13 * * *`、UTC 13:00 = JST 22:00）が Edge Function `nightly-check` を呼ぶ。呼び出しは共有シークレット（`CRON_SECRET`）で認証する。この毎日の呼び出しが Supabase の一時停止対策も兼ねるため、未設定がない日も必ず呼ぶ。翌日の、中止されていないドライランド枠のうちメニューがないものを1通にまとめて送る。該当がなければ送らない。

### 選手宛て（コーチのボタン操作）

- メニュー編集画面のボタンは「保存」と「保存して選手に通知」の2つ。保存したメニューは通知の有無にかかわらず、すぐ選手に表示される
- 一括貼り付けの画面には「選手に通知する」チェック（初期値オン）を置く
- `menus.updated_at > notified_at`（または `notified_at` が空）のメニューには、コーチ画面に「未通知」の印を付ける
- 通知は Edge Function `notify-menu` に枠IDのリストを渡して送る。関数は呼び出した人がコーチかを確認し、選手ごとに1通にまとめる
  - 初めての通知：「11/10（火）のドライランドにメニューが入りました」
  - 2回目以降：「11/10（火）のメニューが変更されました」
  - 複数日の場合：「11/10（火）ほか2日のメニューが入りました」

### 秘密情報

Edge Function の URL と service role キーは Supabase Vault に置き、トリガーからはそこを参照する。VAPID 秘密鍵と `CRON_SECRET` は Edge Function の Secrets に置き、`CRON_SECRET` は Cloudflare Worker の Secrets にも同じ値を置く。

## 5. 行単位アクセス制御（RLS）

- すべてのテーブルで RLS を有効にし、許可していない操作はすべて拒否されるようにする
- 判定用の関数 `is_coach()` と `is_active_user()` を作る（security definer 指定。停止中なら false）

| テーブル | 選手 | コーチ |
| --- | --- | --- |
| profiles | 自分の行を読む | 全員分を読む（更新は Edge Function 経由） |
| events | 自分の分を読む・追加・更新。削除はメニューがない枠だけ | 全員分を読む。`change_ack_at` だけ専用の関数で更新 |
| event_cancel_history | 自分の分を読む | 読む |
| menus | 自分の枠のものを読む | すべての操作が可能（ドライランド枠かつ記録開始前に限る） |
| records | 自分の枠のものを読む・書く（メニューがある枠に限る） | 読む |
| templates / reference_notes / exercise_names | アクセス不可 | すべての操作が可能 |
| push_subscriptions | 自分の分のみ | 自分の分のみ |
| notification_log | アクセス不可 | 読む |

RLS だけでは表せない規則は、トリガーで強制する。

- メニューがある枠は削除できない（中止のみ）
- メニューがある枠は `kind` を変更できない
- 選手は `athlete_id`、`change_ack_at`、`changed_from` を直接変更できない
- 記録開始後は menus を更新・削除できない（Q1）
- メニュー設定済みの枠の日時・場所・時間が変わったら `changed_from` を記録し（最初の1回だけ）、`change_ack_at` をクリアする

### アカウント

- Supabase Auth の新規登録は無効にする
- **ログインはメールで届く6桁のコードをアプリに入力する方式**（要件書の「メールのリンクでログイン」から変更）
  - iPhone ではメールのリンクが Safari で開き、ホーム画面のアプリにはログイン状態が渡らないため
  - `signInWithOtp({ shouldCreateUser: false })` でコードを送り、`verifyOtp({ type: 'email' })` で確認する
  - メール文面は Auth の Magic Link テンプレート（`supabase/templates/magic_link.html`）。コードと「はじめて使う方へ」の手順を載せる
- **profiles はトリガー `handle_new_user` が作る**。コーチがまだいなければ最初のユーザーがコーチ、以降は選手。選手の色は空いている色から自動で割り当てる
- 招待は Edge Function `invite-athlete`
  - 呼び出した人が有効なコーチかを確認する
  - 同じメールアドレスが登録済みなら断る。選手は5人まで（停止中は数えない）
  - `auth.admin.createUser({ email_confirm: true })` でユーザーを作り、そのアドレスにログインコードのメールを送る
  - Supabase の招待メール（`inviteUserByEmail`）は使わない。リンクを押すまでメール未確認のままになり、コードでログインできないため
- 停止・再開は Edge Function `set-athlete-status`。`profiles.is_active` とアカウント凍結（ban）の両方を切り替える
- コーチの選手一覧は関数 `list_athletes()`（コーチのみ。最終ログイン日時から「招待中／利用中」を表示する）
- 最初のコーチアカウントは、Supabase 管理画面の「Create new user（Auto Confirm User）」で作る（`docs/setup.md`）

### 予定（フェーズ2で実装）

- 予定を追加・変更・中止・削除できるのは、有効な選手本人だけ（RLS）。コーチは全員分を読むだけ
- 選手は `athlete_id`（持ち主）を変えられない。`changed_from` と `change_ack_at` は、利用者が更新しても元の値に戻る（トリガー）
- 中止には理由（1〜100文字）が必須。中止・取り消しは `event_cancel_history` に残る。通常に戻すと予定の中止理由は消えるが、履歴には残る
- コピーされるのは枠（種類・開始時刻・場所・時間）だけ。貼り付けは選んだ日ごとに1件追加し、既存の予定は上書きしない
- 「メニューが入った枠は削除できない」「メニュー設定後の変更を記録する」は、menus を作るフェーズ3でトリガーを追加する

## 6. 表示上の決まり

- 秒の値は、60で割り切れれば「5分」、割り切れなければ「1分30秒」のように表示する（入力と保存は秒）
- 予定の種類の色：選手画面は種類別、コーチ画面は選手別
- 月表示は日曜始まりのマス目で、その月の1日から月末までを表示する（前後の月の日は薄く表示）
- 週表示は今日を先頭に7日間。左右スワイプか「前の7日／次の7日」で7日ずつ移動する
- 枠の印：未設定／設定済み／未通知（コーチのみ）／実施中／実施済み／変更あり（コーチのみ）／中止

## 7. 実装フェーズ

各フェーズは「マイグレーションと pgTAP テスト → 画面 → 確認」の順で進める。

| フェーズ | 内容 | 完了の目安 |
| --- | --- | --- |
| 0. 基盤と事前検証 | 雛形、Supabase のローカル環境、Cloudflare Pages へのデプロイ、Cron 用 Worker の雛形、Gmail SMTP の設定。iPhone 実機で Web Push が届くかを確認 | 実機のホーム画面アプリにテスト通知が届く。招待メールが届く |
| 1. 認証とアカウント | profiles、RLS の基礎、メールのコードでのログイン、招待・停止・停止解除、選手管理画面 | 招待した選手だけがログインできる。RLS のテストが通る |
| 2. 予定カレンダー（選手） | events、週表示・月表示、入力・編集、コピーと貼り付け、中止・中止取り消し・削除 | 選手が予定を一通り操作できる |
| 3. メニュー作成（コーチ） | 全員カレンダー、メニュー編集、種目名の候補、一括貼り付け、変更ありの表示と「確認済み」 | コーチがメニューを入れ、選手が閲覧できる |
| 4. 実施記録と確認 | 実施画面、チェック、実績の修正、種目の追加、完了、記録開始によるロック、コーチ側の差分表示 | 計画と実績の差分が正しく表示される。記録開始後にメニューを編集できない |
| 5. テンプレートと参考メニュー帳 | 一覧（タグで絞り込み）、詳細、「テンプレートを作る」、メニュー作成画面からの呼び出し | — |
| 6. 通知 | 購読登録、コーチ宛ての自動通知トリガー、22時のチェック、「選手に通知」ボタン、初回ログイン時の案内 | 4章の通知がすべて条件どおりに届く |
| 7. 仕上げ | Playwright での一連の操作テスト、本番環境の設定、運用手順書 | コーチと選手1人で実際に1週間試せる |
