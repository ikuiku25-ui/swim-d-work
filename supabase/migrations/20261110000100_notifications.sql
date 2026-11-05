-- フェーズ6：通知
--
-- ・プッシュ通知の購読（端末ごと）を push_subscriptions に持つ。本人の分だけ読み書きできる
-- ・コーチ宛ての通知は events のトリガーが条件を判定し、notifications（送信待ち）に入れる
--   → 選手のアプリが保存直後に Edge Function flush-notifications を呼んで送る（毎晩22時にも残りを送る）
--   DB から Edge Function を直接呼ばないので、DB に秘密の鍵を置かなくてよい
-- ・選手宛ての通知はコーチのボタン操作で Edge Function notify-menu が送る（menus.notified_at を更新）

-- ---------------------------------------------------------------------------
-- 購読
-- ---------------------------------------------------------------------------

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) between 1 and 200),
  auth text not null check (char_length(auth) between 1 and 100),
  user_agent text not null default '' check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);

create index push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy push_subscriptions_own_select on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy push_subscriptions_own_delete on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on table public.push_subscriptions from anon;
-- 追加・更新は関数 register_push_subscription だけで行う（同じ端末を別の人が使っても乗り換えられるように）
revoke insert, update, truncate on table public.push_subscriptions from authenticated;

create function public.register_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_user() then
    raise exception 'ログインが必要です' using errcode = '42501';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values ((select auth.uid()), p_endpoint, p_p256dh, p_auth, left(coalesce(p_user_agent, ''), 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now();
end;
$$;

revoke all on function public.register_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 送信待ち（送信後は記録として残す）
-- ---------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  -- event_added_late：締切後にメニュー未設定の枠が追加・移動された
  -- event_changed：メニューが入った枠が変更された / event_canceled：中止された
  kind text not null check (kind in ('event_added_late', 'event_changed', 'event_canceled')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  -- 送った端末の数（0 なら購読なし）
  delivered integer,
  error text
);

create index notifications_pending on public.notifications (created_at) where sent_at is null;

alter table public.notifications enable row level security;
-- 利用者からは触れない（Edge Function が service role で扱う）
revoke all on table public.notifications from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 締切の判定：前日22:00以降の翌日分、または当日分（日本時間）
-- ---------------------------------------------------------------------------

create function public.is_after_deadline(p_date date, p_now timestamptz default now())
returns boolean
language sql
stable
set search_path = ''
as $$
  with jst as (select (p_now at time zone 'Asia/Tokyo') as t)
  select p_date <= (select t::date from jst)
      or (p_date = (select t::date from jst) + 1 and (select t::time from jst) >= time '22:00');
$$;

-- ---------------------------------------------------------------------------
-- コーチ宛ての通知をためるトリガー
-- ---------------------------------------------------------------------------

create function public.event_snapshot(e public.events)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'date', e.date, 'start_time', to_char(e.start_time, 'HH24:MI'),
    'place', e.place, 'duration_min', e.duration_min);
$$;

create function public.events_queue_coach_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach uuid;
  v_name text;
  v_kind text;
  v_payload jsonb;
  v_has_menu boolean;
  v_was_target boolean;
  v_is_target boolean;
begin
  -- 選手本人の操作だけが対象（管理者の操作や seed は通知しない）
  if (select auth.uid()) is null or (select auth.uid()) <> new.athlete_id then
    return null;
  end if;
  select id into v_coach from public.profiles where role = 'coach' and is_active;
  if v_coach is null then
    return null;
  end if;
  select display_name into v_name from public.profiles where id = new.athlete_id;

  v_has_menu := public.event_has_menu(new.id);
  v_is_target := new.kind = 'dryland' and new.status = 'normal';
  v_was_target := tg_op = 'UPDATE' and old.kind = 'dryland' and old.status = 'normal';
  v_payload := jsonb_build_object('athlete_name', v_name, 'event_id', new.id, 'event', public.event_snapshot(new));

  if v_has_menu and tg_op = 'UPDATE' then
    -- メニューが入った枠：日時を問わず、変更・中止を知らせる
    if new.status = 'canceled' and old.status = 'normal' then
      v_kind := 'event_canceled';
      v_payload := v_payload || jsonb_build_object('reason', new.cancel_reason);
    elsif public.event_snapshot(new) is distinct from public.event_snapshot(old)
          or (new.status = 'normal' and old.status = 'canceled') then
      v_kind := 'event_changed';
      v_payload := v_payload || jsonb_build_object(
        'from', public.event_snapshot(old),
        'restored', new.status = 'normal' and old.status = 'canceled');
    end if;
  elsif not v_has_menu and v_is_target and public.is_after_deadline(new.date) then
    -- メニュー未設定の枠：締切後に追加・移動されたときだけ（締切前の分は22時のチェックで拾う）
    if tg_op = 'INSERT'
       or not v_was_target
       or new.date is distinct from old.date
       or new.start_time is distinct from old.start_time then
      v_kind := 'event_added_late';
      if tg_op = 'UPDATE' and v_was_target then
        v_payload := v_payload || jsonb_build_object('from', public.event_snapshot(old));
      end if;
    end if;
  end if;

  if v_kind is not null then
    insert into public.notifications (recipient_id, kind, payload) values (v_coach, v_kind, v_payload);
  end if;
  return null;
end;
$$;

create trigger events_30_queue_coach_notification
  after insert or update on public.events
  for each row execute function public.events_queue_coach_notification();

-- ---------------------------------------------------------------------------
-- menus：通知日時だけを更新したときは「内容の更新日時」を変えない（未通知の判定に使う）
-- ---------------------------------------------------------------------------

create or replace function public.menus_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.event_id := old.event_id;
    new.created_at := old.created_at;
    if new.blocks is distinct from old.blocks then
      new.updated_at := now();
    else
      new.updated_at := old.updated_at;
    end if;
  else
    new.created_at := now();
    new.updated_at := now();
  end if;
  -- 通知日時はシステム（notify-menu）だけが書く
  if current_user = 'authenticated' then
    new.notified_at := case when tg_op = 'UPDATE' then old.notified_at else null end;
  end if;
  return new;
end;
$$;

revoke all on function public.events_queue_coach_notification() from public, anon, authenticated;
revoke all on function public.event_snapshot(public.events) from public, anon;
revoke all on function public.is_after_deadline(date, timestamptz) from public, anon;
