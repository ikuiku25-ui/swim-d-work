-- フェーズ1：アカウント（コーチ1人・選手）とアクセス制御の基礎
--
-- ・ユーザーの作成は「コーチの招待（Edge Function invite-athlete）」か「Supabase 管理画面の招待」だけ
--   （Auth の新規登録は無効）
-- ・auth.users に行ができたらトリガーで profiles を作る。最初の1人はコーチ、以降は選手
-- ・profiles はクライアントから直接書き換えられない。停止・再開は Edge Function（service role）で行う

create type public.user_role as enum ('coach', 'athlete');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 30),
  email text not null,
  -- コーチの全員カレンダーで選手を色分けするための色（#rrggbb）
  color text not null check (color ~ '^#[0-9a-f]{6}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'コーチと選手のプロフィール。行の作成はトリガー、更新は Edge Function のみ';

-- コーチは1人だけ
create unique index profiles_one_coach on public.profiles (role) where role = 'coach';

alter table public.profiles enable row level security;

-- ---------------------------------------------------------------------------
-- 判定用の関数（RLS から使う。security definer で profiles の RLS を経由せずに読む）
-- ---------------------------------------------------------------------------

create function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active
  );
$$;

create function public.is_coach()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'coach' and p.is_active
  );
$$;

revoke all on function public.is_active_user() from public, anon;
revoke all on function public.is_coach() from public, anon;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_coach() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS：読むのは「自分の行」か「コーチなら全員」。書き込みのポリシーは作らない（＝拒否）
-- ---------------------------------------------------------------------------

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_coach()));

-- anon には何も見せない
revoke all on table public.profiles from anon;
-- authenticated は読むだけ（行の制限は RLS）
revoke insert, update, delete, truncate on table public.profiles from authenticated;

-- ---------------------------------------------------------------------------
-- updated_at の自動更新
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 新しいユーザーができたら profiles を作る
-- ---------------------------------------------------------------------------

-- 選手の色（コーチカレンダー用）。使われていない色から順に割り当て、6人目以降は巡回する
create function public.next_athlete_color()
returns text
language sql
stable
set search_path = ''
as $$
  with palette(color, ord) as (
    values ('#2563eb', 1), ('#dc2626', 2), ('#16a34a', 3), ('#d97706', 4),
           ('#9333ea', 5), ('#0891b2', 6), ('#db2777', 7), ('#4b5563', 8)
  )
  select coalesce(
    (select color from palette
      where color not in (select p.color from public.profiles p where p.role = 'athlete')
      order by ord limit 1),
    (select color from palette
      order by ord
      offset ((select count(*) from public.profiles p where p.role = 'athlete') % 8)
      limit 1)
  );
$$;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role;
  v_name text;
begin
  -- コーチがまだいなければ、最初のユーザーをコーチにする
  if exists (select 1 from public.profiles where role = 'coach') then
    v_role := 'athlete';
  else
    v_role := 'coach';
  end if;

  v_name := left(btrim(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    split_part(new.email, '@', 1)
  )), 30);

  insert into public.profiles (id, role, display_name, email, color)
  values (
    new.id,
    v_role,
    v_name,
    coalesce(new.email, ''),
    case when v_role = 'coach' then '#0b5fa5' else public.next_athlete_color() end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- コーチ用：選手の一覧（ログイン状況つき）
-- ---------------------------------------------------------------------------

create function public.list_athletes()
returns table (
  id uuid,
  display_name text,
  email text,
  color text,
  is_active boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_coach() then
    raise exception 'コーチのみ利用できます' using errcode = '42501';
  end if;
  return query
    select p.id, p.display_name, p.email, p.color, p.is_active, p.created_at, u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.role = 'athlete'
    order by p.is_active desc, p.created_at;
end;
$$;

revoke all on function public.list_athletes() from public, anon;
grant execute on function public.list_athletes() to authenticated;

-- 内部用の関数はクライアントから呼べないようにする
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.next_athlete_color() from public, anon, authenticated;
