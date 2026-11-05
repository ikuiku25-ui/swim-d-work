-- profiles の作成トリガーと RLS のテスト
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(24);

-- ---------------------------------------------------------------------------
-- テスト用ユーザー（auth.users に入れるとトリガーで profiles ができる）
-- ---------------------------------------------------------------------------
create function pg_temp.new_user(p_email text, p_name text) returns uuid
language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          p_email, jsonb_build_object('display_name', p_name), now(), now());
  return v_id;
end $$;

-- 指定ユーザーとして振る舞う（null なら未ログイン = anon）
create function pg_temp.act_as(p_id uuid) returns void
language plpgsql as $$
begin
  if p_id is null then
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  else
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  end if;
end $$;

create function pg_temp.reset_role() returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- seed のユーザーがいても結果が変わらないよう、空の状態から始める（最後に rollback される）
delete from auth.users;

-- テスト内でユーザーIDを共有するための表（RLS の外に置く）
create temp table ids (name text primary key, id uuid);
grant select on ids to anon, authenticated;

insert into ids values
  ('coach', pg_temp.new_user('coach@example.com', 'コーチ')),
  ('a',     pg_temp.new_user('a@example.com', '選手A')),
  ('b',     pg_temp.new_user('b@example.com', '')),
  ('c',     pg_temp.new_user('c@example.com', '選手C'));

-- ---------------------------------------------------------------------------
-- トリガー
-- ---------------------------------------------------------------------------
select is(
  (select role from profiles where id = (select id from ids where name = 'coach')),
  'coach'::user_role, '最初のユーザーはコーチになる');
select is(
  (select role from profiles where id = (select id from ids where name = 'a')),
  'athlete'::user_role, '2人目以降は選手になる');
select is(
  (select display_name from profiles where id = (select id from ids where name = 'a')),
  '選手A', '招待時の名前が入る');
select is(
  (select display_name from profiles where id = (select id from ids where name = 'b')),
  'b', '名前が空ならメールアドレスの@より前を使う');
select is(
  (select count(distinct color)::int from profiles where role = 'athlete'),
  3, '選手ごとに別の色が割り当てられる');
select throws_ok(
  $$ insert into profiles (id, role, display_name, email, color)
     values ((select id from ids where name = 'a'), 'coach', 'x', 'x@example.com', '#000000') $$,
  '23505', null, 'コーチは2人作れない（一意制約）');

-- ---------------------------------------------------------------------------
-- 未ログイン（anon）
-- ---------------------------------------------------------------------------
select pg_temp.act_as(null);
select throws_ok('select count(*) from profiles', '42501', null, '未ログインは profiles を読めない');
select throws_ok('select * from list_athletes()', '42501', null, '未ログインは選手一覧を呼べない');
select pg_temp.reset_role();

-- ---------------------------------------------------------------------------
-- 選手A
-- ---------------------------------------------------------------------------
select pg_temp.act_as((select id from ids where name = 'a'));
select is((select count(*)::int from profiles), 1, '選手は自分の行だけ読める');
select is((select id from profiles), (select id from ids where name = 'a'), '読めるのは自分の行');
select is(
  (select count(*)::int from profiles where id = (select id from ids where name = 'b')),
  0, '選手Aは選手Bの行を読めない');
select ok(not is_coach(), '選手は is_coach() が false');
select ok(is_active_user(), '有効な選手は is_active_user() が true');
select throws_ok(
  $$ update profiles set role = 'coach' where id = (select id from ids where name = 'a') $$,
  '42501', null, '選手は自分の役割を変えられない');
select throws_ok(
  $$ update profiles set display_name = 'x' where id = (select id from ids where name = 'b') $$,
  '42501', null, '選手は他人の行を書き換えられない');
select throws_ok(
  $$ delete from profiles where id = (select id from ids where name = 'b') $$,
  '42501', null, '選手は行を削除できない');
select throws_ok('select * from list_athletes()', '42501', null, '選手は選手一覧を呼べない');
select pg_temp.reset_role();

-- ---------------------------------------------------------------------------
-- コーチ
-- ---------------------------------------------------------------------------
select pg_temp.act_as((select id from ids where name = 'coach'));
select is((select count(*)::int from profiles), 4, 'コーチは全員の行を読める');
select ok(is_coach(), 'コーチは is_coach() が true');
select is((select count(*)::int from list_athletes()), 3, 'コーチは選手一覧を取得できる（コーチ自身は含まない）');
select throws_ok(
  $$ update profiles set is_active = false where id = (select id from ids where name = 'a') $$,
  '42501', null, 'コーチも profiles を直接は書き換えられない（Edge Function 経由）');
select pg_temp.reset_role();

-- ---------------------------------------------------------------------------
-- 停止
-- ---------------------------------------------------------------------------
update profiles set is_active = false where id = (select id from ids where name = 'c');
select pg_temp.act_as((select id from ids where name = 'c'));
select ok(not is_active_user(), '停止した選手は is_active_user() が false');
select pg_temp.reset_role();

update profiles set is_active = false where id = (select id from ids where name = 'coach');
select pg_temp.act_as((select id from ids where name = 'coach'));
select ok(not is_coach(), '停止したコーチは is_coach() が false');
select is((select count(*)::int from profiles), 1, '停止したコーチは自分の行しか読めない');
select pg_temp.reset_role();

select * from finish();
rollback;
