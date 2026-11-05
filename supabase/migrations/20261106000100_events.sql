-- フェーズ2：予定（カレンダーの枠）
--
-- ・予定を入れるのは選手本人だけ。コーチは全員分を読むだけ
-- ・日付と時刻は日本時間の date / time で持つ（タイムゾーン変換をしない）
-- ・メニューが入った枠の削除禁止と「変更あり」の記録（changed_from）は、menus を作るフェーズ3で追加する

create type public.event_kind as enum ('dryland', 'swim', 'meet');
create type public.event_status as enum ('normal', 'canceled');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind public.event_kind not null,
  date date not null,
  start_time time not null,
  place text not null default '' check (char_length(place) <= 50),
  duration_min integer not null check (duration_min between 1 and 600),
  status public.event_status not null default 'normal',
  cancel_reason text,
  -- メニュー設定後に日時・場所・時間が変わったとき、最初の値を入れる（フェーズ3）
  changed_from jsonb,
  -- コーチが「変更あり」を確認した日時（フェーズ3）
  change_ack_at timestamptz,
  -- 選手が実施を「完了」にした日時（フェーズ4）
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 中止のときは理由が必須、通常のときは理由なし
  constraint events_cancel_reason check (
    (status = 'canceled' and char_length(btrim(coalesce(cancel_reason, ''))) between 1 and 100)
    or (status = 'normal' and cancel_reason is null)
  )
);

comment on table public.events is '予定の枠（ドライランド／水中練習／試合）。選手本人が入力し、コーチは閲覧のみ';

create index events_athlete_date on public.events (athlete_id, date);
create index events_date on public.events (date);

-- 中止の履歴（中止理由を取り消し後も残す）
create table public.event_cancel_history (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  reason text not null,
  canceled_at timestamptz not null default now(),
  restored_at timestamptz
);

create index event_cancel_history_event on public.event_cancel_history (event_id, canceled_at);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.events enable row level security;
alter table public.event_cancel_history enable row level security;

-- 読む：本人（有効な場合）とコーチ
create policy events_select on public.events
  for select to authenticated
  using (
    (athlete_id = (select auth.uid()) and (select public.is_active_user()))
    or (select public.is_coach())
  );

-- 追加・更新・削除：有効な選手本人のみ（コーチは入力しない）
create policy events_insert on public.events
  for insert to authenticated
  with check (
    athlete_id = (select auth.uid())
    and (select public.is_active_user())
    and not (select public.is_coach())
  );

create policy events_update on public.events
  for update to authenticated
  using (athlete_id = (select auth.uid()) and (select public.is_active_user()))
  with check (athlete_id = (select auth.uid()) and (select public.is_active_user()));

create policy events_delete on public.events
  for delete to authenticated
  using (athlete_id = (select auth.uid()) and (select public.is_active_user()));

create policy event_cancel_history_select on public.event_cancel_history
  for select to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_id
        and ((e.athlete_id = (select auth.uid()) and (select public.is_active_user()))
             or (select public.is_coach()))
    )
  );

revoke all on table public.events from anon;
revoke all on table public.event_cancel_history from anon;
-- 履歴はトリガーだけが書く
revoke insert, update, delete, truncate on table public.event_cancel_history from authenticated;

-- ---------------------------------------------------------------------------
-- トリガー
-- ---------------------------------------------------------------------------

-- 選手が変えてはいけない列を守る（トリガー名の順に実行されるため 10_ を付ける）
create function public.events_guard_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.athlete_id is distinct from old.athlete_id then
    raise exception '予定の持ち主は変更できません' using errcode = '42501';
  end if;
  -- システムが管理する列は、利用者の更新では元の値に戻す
  if current_user = 'authenticated' then
    new.created_at := old.created_at;
    new.changed_from := old.changed_from;
    new.change_ack_at := old.change_ack_at;
  end if;
  -- 通常に戻したら中止理由は消す（理由は履歴に残る）
  if new.status = 'normal' then
    new.cancel_reason := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger events_10_guard_columns
  before update on public.events
  for each row execute function public.events_guard_columns();

-- 追加時：システムが管理する列は空にする
create function public.events_guard_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    new.changed_from := null;
    new.change_ack_at := null;
    new.completed_at := null;
    new.created_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger events_10_guard_insert
  before insert on public.events
  for each row execute function public.events_guard_insert();

-- 中止・中止の取り消しを履歴に残す
create function public.events_record_cancel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'canceled' and (old.status = 'normal' or tg_op = 'INSERT') then
    insert into public.event_cancel_history (event_id, reason) values (new.id, new.cancel_reason);
  elsif tg_op = 'UPDATE' and new.status = 'normal' and old.status = 'canceled' then
    update public.event_cancel_history h
      set restored_at = now()
      where h.id = (
        select id from public.event_cancel_history
        where event_id = new.id and restored_at is null
        order by canceled_at desc limit 1
      );
  elsif tg_op = 'UPDATE' and new.status = 'canceled' and old.status = 'canceled'
        and new.cancel_reason is distinct from old.cancel_reason then
    update public.event_cancel_history h
      set reason = new.cancel_reason
      where h.id = (
        select id from public.event_cancel_history
        where event_id = new.id and restored_at is null
        order by canceled_at desc limit 1
      );
  end if;
  return null;
end;
$$;

create trigger events_20_record_cancel
  after insert or update of status, cancel_reason on public.events
  for each row execute function public.events_record_cancel();

revoke all on function public.events_guard_columns() from public, anon, authenticated;
revoke all on function public.events_guard_insert() from public, anon, authenticated;
revoke all on function public.events_record_cancel() from public, anon, authenticated;
