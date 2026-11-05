-- records（実施記録）の RLS・記録開始の判定・メニューのロックのテスト
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(26);

delete from auth.users;

create function pg_temp.new_user(p_email text, p_name text) returns uuid
language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          p_email, jsonb_build_object('display_name', p_name), now(), now());
  return v_id;
end $$;

create function pg_temp.act_as(p_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
end $$;

create function pg_temp.reset_role() returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

create function pg_temp.menu() returns jsonb
language sql as $$
  select '[{"id":"b1","type":"circuit","rounds":3,"rest_between_exercises_sec":15,"rest_between_rounds_sec":90,"memo":"",
            "exercises":[{"id":"e1","name":"スクワット","value":15,"unit":"reps","load":"自重","memo":""},
                         {"id":"e2","name":"プランク","value":30,"unit":"sec","load":"","memo":""}]}]'::jsonb;
$$;

create temp table ids (name text primary key, id uuid);
grant select on ids to authenticated;
insert into ids values
  ('coach', pg_temp.new_user('coach@example.com', 'コーチ')),
  ('a',     pg_temp.new_user('a@example.com', '選手A')),
  ('b',     pg_temp.new_user('b@example.com', '選手B'));

insert into events (id, athlete_id, kind, date, start_time, place, duration_min) values
  ('00000000-0000-0000-0000-00000000a001', (select id from ids where name = 'a'), 'dryland', '2026-11-10', '16:00', '学校', 40),
  ('00000000-0000-0000-0000-00000000a002', (select id from ids where name = 'a'), 'dryland', '2026-11-11', '16:00', '学校', 40),
  ('00000000-0000-0000-0000-00000000a003', (select id from ids where name = 'a'), 'dryland', '2026-11-12', '16:00', '学校', 40),
  ('00000000-0000-0000-0000-00000000b001', (select id from ids where name = 'b'), 'dryland', '2026-11-10', '17:00', '自宅', 30);
insert into menus (event_id, blocks) values
  ('00000000-0000-0000-0000-00000000a001', pg_temp.menu()),
  ('00000000-0000-0000-0000-00000000a003', pg_temp.menu()),
  ('00000000-0000-0000-0000-00000000b001', pg_temp.menu());

-- ---------------------------------------------------------------------------
-- 記録開始の判定（純粋関数）
-- ---------------------------------------------------------------------------
select ok(not record_is_started('{}', '{}', '[]', null), '何もしていなければ未開始');
select ok(not record_is_started('{"e1":{"checked":false,"value":null,"load":null}}', '{"b1":{"rounds":null}}', '[]', null),
  'チェックを外しただけ・計画どおりなら未開始');
select ok(record_is_started('{"e1":{"checked":true,"value":null,"load":null}}', '{}', '[]', null), 'チェックがあれば開始');
select ok(record_is_started('{"e1":{"checked":false,"value":12,"load":null}}', '{}', '[]', null), '実績値の変更があれば開始');
select ok(record_is_started('{}', '{"b1":{"rounds":2}}', '[]', null), '周回数の変更があれば開始');
select ok(record_is_started('{}', '{}', '[{"id":"x1","name":"腹筋","value":20,"unit":"reps","load":"","memo":""}]', null),
  '種目の追加があれば開始');
select ok(record_is_started('{}', '{}', '[]', now()), '完了にしていれば開始');

-- ---------------------------------------------------------------------------
-- 選手A
-- ---------------------------------------------------------------------------
select pg_temp.act_as((select id from ids where name = 'a'));
select lives_ok(
  $$ insert into records (event_id, exercise_results)
     values ('00000000-0000-0000-0000-00000000a001', '{"e1":{"checked":false,"value":null,"load":null}}') $$,
  '選手は自分の枠に記録を作れる');
select ok(
  (select not started from records where event_id = '00000000-0000-0000-0000-00000000a001'),
  '何もチェックしていなければ記録開始ではない');
select throws_ok(
  $$ insert into records (event_id) values ('00000000-0000-0000-0000-00000000a002') $$,
  '42501', null, 'メニューのない枠には記録できない');
select throws_ok(
  $$ insert into records (event_id) values ('00000000-0000-0000-0000-00000000b001') $$,
  '42501', null, '他人の枠には記録できない');
select throws_ok(
  $$ update records set exercise_results = '{"e1":{"checked":"yes"}}' where event_id = '00000000-0000-0000-0000-00000000a001' $$,
  '23514', null, '形式が正しくない記録は保存できない');
select throws_ok(
  $$ update records set block_results = '{"b1":{"rounds":21}}' where event_id = '00000000-0000-0000-0000-00000000a001' $$,
  '23514', null, '周回数は20まで');
select pg_temp.reset_role();

-- 記録開始前ならコーチはメニューを変更できる
select pg_temp.act_as((select id from ids where name = 'coach'));
select lives_ok(
  $$ update menus set blocks = pg_temp.menu() where event_id = '00000000-0000-0000-0000-00000000a001' $$,
  '記録開始前なら、コーチはメニューを変更できる');
select pg_temp.reset_role();

select pg_temp.act_as((select id from ids where name = 'a'));
select lives_ok(
  $$ update records set exercise_results = '{"e1":{"checked":true,"value":12,"load":null},"e2":{"checked":false,"value":null,"load":null}}',
                        block_results = '{"b1":{"rounds":2}}'
     where event_id = '00000000-0000-0000-0000-00000000a001' $$,
  '選手はチェックと実績値を記録できる');
select ok(
  (select started from records where event_id = '00000000-0000-0000-0000-00000000a001'),
  'チェックすると記録開始になる');
select ok(
  (select blocks -> 0 -> 'exercises' -> 0 ->> 'value' = '15' from menus where event_id = '00000000-0000-0000-0000-00000000a001'),
  '計画値は上書きされない');
update records set started = false where event_id = '00000000-0000-0000-0000-00000000a001';
select ok(
  (select started from records where event_id = '00000000-0000-0000-0000-00000000a001'),
  'started は利用者が書き換えても、トリガーが計算し直す');
select lives_ok(
  $$ update records set completed_at = now() where event_id = '00000000-0000-0000-0000-00000000a001' $$,
  '選手は完了にできる');
select throws_ok(
  $$ delete from records where event_id = '00000000-0000-0000-0000-00000000a001' $$,
  '42501', null, '選手も記録は削除できない');
select pg_temp.reset_role();

-- ---------------------------------------------------------------------------
-- コーチ
-- ---------------------------------------------------------------------------
select pg_temp.act_as((select id from ids where name = 'coach'));
select is((select count(*)::int from records), 1, 'コーチは記録を読める');
select throws_ok(
  $$ update menus set blocks = pg_temp.menu() where event_id = '00000000-0000-0000-0000-00000000a001' $$,
  'P0001', '選手が記録を始めたため、このメニューは変更できません', '記録開始後はメニューを変更できない');
select throws_ok(
  $$ delete from menus where event_id = '00000000-0000-0000-0000-00000000a001' $$,
  'P0001', '選手が記録を始めたため、このメニューは変更できません', '記録開始後はメニューを削除できない');
select is_empty(
  $$ update records set completed_at = null where event_id = '00000000-0000-0000-0000-00000000a001' returning 1 $$,
  'コーチは記録を書き換えられない');
select throws_ok(
  $$ insert into records (event_id) values ('00000000-0000-0000-0000-00000000a003') $$,
  '42501', null, 'コーチは記録を作れない');
select pg_temp.reset_role();

-- 選手Bは選手Aの記録を読めない
select pg_temp.act_as((select id from ids where name = 'b'));
select is((select count(*)::int from records), 0, '選手Bは選手Aの記録を読めない');
select pg_temp.reset_role();

select * from finish();
rollback;
