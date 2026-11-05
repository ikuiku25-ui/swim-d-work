-- フェーズ4：実施記録（実績）
--
-- ・実績は計画（menus）とは別テーブル。計画値は上書きしない
-- ・書けるのは有効な選手本人だけ（メニューが入った、中止されていない自分の枠）。コーチは読むだけ
-- ・実績値は「計画と違うときだけ」入れる（同じなら null）。画面側で揃えて保存する
-- ・記録開始（started）はトリガーが計算する。記録開始後はメニューを変更・削除できない（Q1）
-- ・完了は records.completed_at に持つ（events.completed_at は使わないので削除する）

alter table public.events drop column completed_at;

-- 削除した列を参照しないよう、予定追加時のトリガー関数を作り直す
create or replace function public.events_guard_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    new.changed_from := null;
    new.change_ack_at := null;
    new.created_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 実績 JSON の検証
-- ---------------------------------------------------------------------------

-- exercise_results: { "<種目ID>": { "checked": bool, "value": int|null, "load": text|null } }
-- block_results:    { "<ブロックID>": { "sets": int|null, "rounds": int|null } }
-- added_exercises:  [ { id, name, value, unit, load, memo } ]（メニューの種目と同じ形式）
create function public.validate_record(p_exercises jsonb, p_blocks jsonb, p_added jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
  v jsonb;
begin
  if jsonb_typeof(p_exercises) <> 'object' or jsonb_typeof(p_blocks) <> 'object'
     or jsonb_typeof(p_added) <> 'array' then
    return false;
  end if;
  if (select count(*) from jsonb_object_keys(p_exercises)) > 500
     or (select count(*) from jsonb_object_keys(p_blocks)) > 100
     or jsonb_array_length(p_added) > 20 then
    return false;
  end if;
  for k, v in select * from jsonb_each(p_exercises) loop
    if char_length(k) > 64 or jsonb_typeof(v) <> 'object'
       or jsonb_typeof(v -> 'checked') <> 'boolean'
       or not (v -> 'value' is null or jsonb_typeof(v -> 'value') = 'null' or public.is_bounded_int(v -> 'value', 0, 9999))
       or not (v -> 'load' is null or jsonb_typeof(v -> 'load') = 'null' or public.is_bounded_text(v -> 'load', 0, 30)) then
      return false;
    end if;
  end loop;
  for k, v in select * from jsonb_each(p_blocks) loop
    if char_length(k) > 64 or jsonb_typeof(v) <> 'object'
       or not (v -> 'sets' is null or jsonb_typeof(v -> 'sets') = 'null' or public.is_bounded_int(v -> 'sets', 0, 20))
       or not (v -> 'rounds' is null or jsonb_typeof(v -> 'rounds') = 'null' or public.is_bounded_int(v -> 'rounds', 0, 20)) then
      return false;
    end if;
  end loop;
  for v in select * from jsonb_array_elements(p_added) loop
    if not public.is_valid_exercise(v) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- 記録開始の判定（Q1）：チェック・計画との違い・種目の追加・完了のどれか
create function public.record_is_started(
  p_exercises jsonb, p_blocks jsonb, p_added jsonb, p_completed_at timestamptz)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_completed_at is not null
      or jsonb_array_length(p_added) > 0
      or exists (
        select 1 from jsonb_each(p_exercises) e
        where (e.value ->> 'checked')::boolean
           or jsonb_typeof(e.value -> 'value') = 'number'
           or jsonb_typeof(e.value -> 'load') = 'string')
      or exists (
        select 1 from jsonb_each(p_blocks) b
        where jsonb_typeof(b.value -> 'sets') = 'number'
           or jsonb_typeof(b.value -> 'rounds') = 'number');
$$;

-- ---------------------------------------------------------------------------
-- テーブル
-- ---------------------------------------------------------------------------

create table public.records (
  event_id uuid primary key references public.events (id) on delete cascade,
  exercise_results jsonb not null default '{}',
  block_results jsonb not null default '{}',
  added_exercises jsonb not null default '[]',
  completed_at timestamptz,
  started boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint records_valid check (public.validate_record(exercise_results, block_results, added_exercises))
);

comment on table public.records is '実施記録（実績）。選手本人のみ書き込み可。計画（menus）とは別に持つ';

alter table public.records enable row level security;

-- 選手が記録できる枠か（自分の、メニューが入った、中止されていない枠）
create function public.is_record_target(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
    join public.menus m on m.event_id = e.id
    where e.id = p_event_id
      and e.athlete_id = (select auth.uid())
      and e.status = 'normal'
  ) and public.is_active_user();
$$;

revoke all on function public.is_record_target(uuid) from public, anon;
grant execute on function public.is_record_target(uuid) to authenticated;

create policy records_select on public.records
  for select to authenticated
  using (
    (select public.is_coach())
    or exists (
      select 1 from public.events e
      where e.id = event_id and e.athlete_id = (select auth.uid()) and (select public.is_active_user())
    )
  );

create policy records_insert on public.records
  for insert to authenticated
  with check (public.is_record_target(event_id));

create policy records_update on public.records
  for update to authenticated
  using (public.is_record_target(event_id))
  with check (public.is_record_target(event_id));

revoke all on table public.records from anon;
revoke delete, truncate on table public.records from authenticated;

-- ---------------------------------------------------------------------------
-- トリガー
-- ---------------------------------------------------------------------------

create function public.records_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.event_id := old.event_id;
    new.created_at := old.created_at;
  else
    new.created_at := now();
  end if;
  new.updated_at := now();
  new.started := public.record_is_started(
    new.exercise_results, new.block_results, new.added_exercises, new.completed_at);
  return new;
end;
$$;

create trigger records_10_before_write
  before insert or update on public.records
  for each row execute function public.records_before_write();

-- 記録開始後はメニューを変更・削除できない（Q1）。アカウント削除などの管理操作は通す
create function public.menus_block_after_record_started()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_event_id uuid := coalesce(old.event_id, new.event_id);
begin
  if current_user = 'authenticated' and public.event_record_started(v_event_id) then
    raise exception '選手が記録を始めたため、このメニューは変更できません'
      using errcode = 'P0001', hint = 'record_started';
  end if;
  return coalesce(new, old);
end;
$$;

create function public.event_record_started(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.records r where r.event_id = p_event_id and r.started);
$$;

revoke all on function public.event_record_started(uuid) from public, anon;
grant execute on function public.event_record_started(uuid) to authenticated;

create trigger menus_05_block_after_record_started
  before update or delete on public.menus
  for each row execute function public.menus_block_after_record_started();

revoke all on function public.records_before_write() from public, anon, authenticated;
revoke all on function public.menus_block_after_record_started() from public, anon, authenticated;
