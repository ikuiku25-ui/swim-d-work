-- フェーズ3：メニュー（計画）と種目名の候補
--
-- ・メニューはドライランド枠に1つ。コーチだけが作成・変更・削除でき、選手は自分の枠のものを読める
-- ・メニュー本体は jsonb（形式は src/lib/menu.ts の zod スキーマと同じ。validate_menu_blocks で検証）
-- ・メニューが入った枠は削除できず（中止のみ）、種類も変えられない
-- ・メニューが入った枠の日時・場所・時間が変わったら changed_from に元の値を残す（コーチの「確認済み」で消える）
-- ・記録開始後にメニューを変更できなくする仕組みは、records を作るフェーズ4で追加する

-- ---------------------------------------------------------------------------
-- メニュー JSON の検証
-- ---------------------------------------------------------------------------

create function public.is_bounded_int(v jsonb, lo integer, hi integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(v) = 'number'
     and (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric)
     and (v #>> '{}')::numeric between lo and hi;
$$;

create function public.is_bounded_text(v jsonb, lo integer, hi integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(v) = 'string' and char_length(v #>> '{}') between lo and hi;
$$;

create function public.is_valid_exercise(e jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(e) = 'object'
     and public.is_bounded_text(e -> 'id', 1, 64)
     and public.is_bounded_text(e -> 'name', 1, 40)
     and char_length(btrim(e ->> 'name')) >= 1
     and public.is_bounded_int(e -> 'value', 1, 9999)
     and (e ->> 'unit') in ('reps', 'sec')
     and public.is_bounded_text(e -> 'load', 0, 30)
     and public.is_bounded_text(e -> 'memo', 0, 200);
$$;

create function public.validate_menu_blocks(blocks jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  b jsonb;
  e jsonb;
  ids text[] := '{}';
begin
  if jsonb_typeof(blocks) <> 'array' or jsonb_array_length(blocks) not between 1 and 30 then
    return false;
  end if;
  for b in select * from jsonb_array_elements(blocks) loop
    if jsonb_typeof(b) <> 'object'
       or not public.is_bounded_text(b -> 'id', 1, 64)
       or not public.is_bounded_text(b -> 'memo', 0, 200) then
      return false;
    end if;
    ids := ids || (b ->> 'id');
    if b ->> 'type' = 'single' then
      if not (public.is_bounded_int(b -> 'sets', 1, 20)
              and public.is_bounded_int(b -> 'rest_sec', 0, 600)
              and public.is_valid_exercise(b -> 'exercise')) then
        return false;
      end if;
      ids := ids || (b -> 'exercise' ->> 'id');
    elsif b ->> 'type' = 'circuit' then
      if not (public.is_bounded_int(b -> 'rounds', 1, 20)
              and public.is_bounded_int(b -> 'rest_between_exercises_sec', 0, 600)
              and public.is_bounded_int(b -> 'rest_between_rounds_sec', 0, 900)
              and jsonb_typeof(b -> 'exercises') = 'array'
              and jsonb_array_length(b -> 'exercises') between 1 and 15) then
        return false;
      end if;
      for e in select * from jsonb_array_elements(b -> 'exercises') loop
        if not public.is_valid_exercise(e) then
          return false;
        end if;
        ids := ids || (e ->> 'id');
      end loop;
    else
      return false;
    end if;
  end loop;
  -- ブロックと種目の ID は重複しない（実績と紐づけるため）
  return cardinality(ids) = (select count(distinct x) from unnest(ids) as x);
end;
$$;

-- ---------------------------------------------------------------------------
-- テーブル
-- ---------------------------------------------------------------------------

create table public.menus (
  event_id uuid primary key references public.events (id) on delete cascade,
  blocks jsonb not null check (public.validate_menu_blocks(blocks)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 選手に通知した日時（フェーズ6）
  notified_at timestamptz
);

comment on table public.menus is 'ドライランド枠のメニュー（計画）。コーチのみ書き込み可';

create table public.exercise_names (
  name text primary key check (char_length(name) between 1 and 40),
  last_used_at timestamptz not null default now()
);

comment on table public.exercise_names is 'メニュー作成時の種目名の候補（コーチのみ）';

alter table public.menus enable row level security;
alter table public.exercise_names enable row level security;

-- メニューを入れられる枠か（ドライランドで、中止されていない）
create function public.is_menu_target(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id and e.kind = 'dryland' and e.status = 'normal'
  );
$$;

revoke all on function public.is_menu_target(uuid) from public, anon;
grant execute on function public.is_menu_target(uuid) to authenticated;

create policy menus_select on public.menus
  for select to authenticated
  using (
    (select public.is_coach())
    or exists (
      select 1 from public.events e
      where e.id = event_id and e.athlete_id = (select auth.uid()) and (select public.is_active_user())
    )
  );

create policy menus_insert on public.menus
  for insert to authenticated
  with check ((select public.is_coach()) and public.is_menu_target(event_id));

create policy menus_update on public.menus
  for update to authenticated
  using ((select public.is_coach()))
  with check ((select public.is_coach()) and public.is_menu_target(event_id));

create policy menus_delete on public.menus
  for delete to authenticated
  using ((select public.is_coach()));

create policy exercise_names_select on public.exercise_names
  for select to authenticated
  using ((select public.is_coach()));

revoke all on table public.menus from anon;
revoke all on table public.exercise_names from anon;
-- 種目名の候補はトリガーだけが書く
revoke insert, update, delete, truncate on table public.exercise_names from authenticated;

-- ---------------------------------------------------------------------------
-- menus のトリガー
-- ---------------------------------------------------------------------------

create function public.menus_before_write()
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
  -- 通知日時はシステムだけが書く（フェーズ6）
  if current_user = 'authenticated' then
    new.notified_at := case when tg_op = 'UPDATE' then old.notified_at else null end;
  end if;
  return new;
end;
$$;

create trigger menus_10_before_write
  before insert or update on public.menus
  for each row execute function public.menus_before_write();

-- 使った種目名を候補に入れる
create function public.menus_collect_exercise_names()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.exercise_names (name, last_used_at)
  select distinct btrim(n), now()
  from (
    select b -> 'exercise' ->> 'name' as n
    from jsonb_array_elements(new.blocks) b
    where b ->> 'type' = 'single'
    union all
    select e ->> 'name'
    from jsonb_array_elements(new.blocks) b,
         jsonb_array_elements(case when b ->> 'type' = 'circuit' then b -> 'exercises' else '[]'::jsonb end) e
  ) s
  where btrim(n) <> ''
  on conflict (name) do update set last_used_at = excluded.last_used_at;
  return null;
end;
$$;

create trigger menus_20_collect_exercise_names
  after insert or update of blocks on public.menus
  for each row execute function public.menus_collect_exercise_names();

-- ---------------------------------------------------------------------------
-- events に追加するトリガー
-- ---------------------------------------------------------------------------

create function public.event_has_menu(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.menus m where m.event_id = p_event_id);
$$;

revoke all on function public.event_has_menu(uuid) from public, anon;
grant execute on function public.event_has_menu(uuid) to authenticated;

-- メニューが入った枠は削除できない
-- security definer にしない（current_user で利用者かどうかを見るため。メニューの有無は event_has_menu が読む）
create function public.events_block_delete_with_menu()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- 利用者による削除だけを止める（アカウント削除に伴う削除などは通す）
  if current_user = 'authenticated' and public.event_has_menu(old.id) then
    raise exception 'メニューが入った予定は削除できません。中止にしてください'
      using errcode = 'P0001', hint = 'menu_exists';
  end if;
  return old;
end;
$$;

create trigger events_10_block_delete_with_menu
  before delete on public.events
  for each row execute function public.events_block_delete_with_menu();

-- メニューが入った枠：種類の変更を禁止し、日時・場所・時間の変更を記録する
-- （events_10_guard_columns の後に動くよう 15_ を付ける）
create function public.events_track_menu_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if not public.event_has_menu(new.id) then
    return new;
  end if;
  if new.kind is distinct from old.kind then
    raise exception 'メニューが入った予定は種類を変更できません'
      using errcode = 'P0001', hint = 'menu_exists';
  end if;

  v_before := jsonb_build_object(
    'date', old.date, 'start_time', to_char(old.start_time, 'HH24:MI'),
    'place', old.place, 'duration_min', old.duration_min);
  v_after := jsonb_build_object(
    'date', new.date, 'start_time', to_char(new.start_time, 'HH24:MI'),
    'place', new.place, 'duration_min', new.duration_min);

  if v_after is distinct from v_before then
    if new.changed_from is null then
      -- 最初の変更：変更前の値を残し、コーチの確認待ちにする
      new.changed_from := v_before;
      new.change_ack_at := null;
    elsif new.changed_from = v_after then
      -- 元の値に戻した：変更なしの扱いにする
      new.changed_from := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger events_15_track_menu_change
  before update on public.events
  for each row execute function public.events_track_menu_change();

-- コーチが「変更あり」を確認済みにする
create function public.acknowledge_event_change(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_coach() then
    raise exception 'コーチのみ利用できます' using errcode = '42501';
  end if;
  update public.events
    set changed_from = null, change_ack_at = now()
    where id = p_event_id;
end;
$$;

revoke all on function public.acknowledge_event_change(uuid) from public, anon;
grant execute on function public.acknowledge_event_change(uuid) to authenticated;

revoke all on function public.menus_before_write() from public, anon, authenticated;
revoke all on function public.menus_collect_exercise_names() from public, anon, authenticated;
revoke all on function public.events_block_delete_with_menu() from public, anon, authenticated;
revoke all on function public.events_track_menu_change() from public, anon, authenticated;
