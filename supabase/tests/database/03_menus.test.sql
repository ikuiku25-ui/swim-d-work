-- menus（メニュー）・exercise_names・events の追加トリガーのテスト
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(34);

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

-- 正しい形式のメニュー
create function pg_temp.menu(p_name text default 'スクワット') returns jsonb
language sql as $$
  select jsonb_build_array(
    jsonb_build_object('id', 'b1', 'type', 'single', 'sets', 1, 'rest_sec', 0, 'memo', '',
      'exercise', jsonb_build_object('id', 'e1', 'name', 'ジョグ', 'value', 300, 'unit', 'sec', 'load', '', 'memo', '')),
    jsonb_build_object('id', 'b2', 'type', 'circuit', 'rounds', 3,
      'rest_between_exercises_sec', 15, 'rest_between_rounds_sec', 90, 'memo', '',
      'exercises', jsonb_build_array(
        jsonb_build_object('id', 'e2', 'name', p_name, 'value', 15, 'unit', 'reps', 'load', '自重', 'memo', ''),
        jsonb_build_object('id', 'e3', 'name', 'プランク', 'value', 30, 'unit', 'sec', 'load', '', 'memo', '')))
  );
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
  ('00000000-0000-0000-0000-00000000a003', (select id from ids where name = 'a'), 'swim',    '2026-11-11', '18:00', 'プール', 90),
  ('00000000-0000-0000-0000-00000000a004', (select id from ids where name = 'a'), 'dryland', '2026-11-12', '16:00', '学校', 40),
  ('00000000-0000-0000-0000-00000000b001', (select id from ids where name = 'b'), 'dryland', '2026-11-10', '17:00', '自宅', 30);
update events set status = 'canceled', cancel_reason = '発熱' where id = '00000000-0000-0000-0000-00000000a004';

-- ---------------------------------------------------------------------------
-- 形式の検証
-- ---------------------------------------------------------------------------
select ok(validate_menu_blocks(pg_temp.menu()), '正しい形式のメニューは通る');
select ok(not validate_menu_blocks('[]'), 'ブロックが0個は不可');
select ok(not validate_menu_blocks(jsonb_set(pg_temp.menu(), '{1,exercises,0,unit}', '"kg"')), '単位は回か秒だけ');
select ok(not validate_menu_blocks(jsonb_set(pg_temp.menu(), '{1,exercises,0,value}', '0')), '回数・秒数は1以上');
select ok(not validate_menu_blocks(jsonb_set(pg_temp.menu(), '{1,exercises,0,value}', '1.5')), '回数・秒数は整数');
select ok(not validate_menu_blocks(jsonb_set(pg_temp.menu(), '{1,exercises,0,name}', '"  "')), '種目名は空にできない');
select ok(not validate_menu_blocks(jsonb_set(pg_temp.menu(), '{1,exercises}', '[]')), 'サーキットは種目が1つ以上');
select ok(not validate_menu_blocks(jsonb_set(pg_temp.menu(), '{1,exercises,1,id}', '"e2"')), '種目IDの重複は不可');
select ok(not validate_menu_blocks(jsonb_set(pg_temp.menu(), '{0,type}', '"other"')), 'ブロックの種類は単独かサーキット');
select ok(not validate_menu_blocks(jsonb_set(pg_temp.menu(), '{1,rounds}', '21')), '周回数は20まで');

-- ---------------------------------------------------------------------------
-- コーチ
-- ---------------------------------------------------------------------------
select pg_temp.act_as((select id from ids where name = 'coach'));
select lives_ok(
  $$ insert into menus (event_id, blocks) values ('00000000-0000-0000-0000-00000000a001', pg_temp.menu()) $$,
  'コーチはドライランド枠にメニューを入れられる');
select throws_ok(
  $$ insert into menus (event_id, blocks) values ('00000000-0000-0000-0000-00000000a003', pg_temp.menu()) $$,
  '42501', null, '水中練習の枠にはメニューを入れられない');
select throws_ok(
  $$ insert into menus (event_id, blocks) values ('00000000-0000-0000-0000-00000000a004', pg_temp.menu()) $$,
  '42501', null, '中止した枠にはメニューを入れられない');
select throws_ok(
  $$ insert into menus (event_id, blocks) values ('00000000-0000-0000-0000-00000000a002', '[]') $$,
  '23514', null, '形式が正しくないメニューは保存できない');
select lives_ok(
  $$ insert into menus (event_id, blocks) values
       ('00000000-0000-0000-0000-00000000a002', pg_temp.menu()),
       ('00000000-0000-0000-0000-00000000b001', pg_temp.menu())
     on conflict (event_id) do update set blocks = excluded.blocks $$,
  '複数の選手・日付にまとめて貼り付けられる');
select lives_ok(
  $$ update menus set blocks = pg_temp.menu('ランジ') where event_id = '00000000-0000-0000-0000-00000000a001' $$,
  'コーチはメニューを変更できる');
select ok(
  (select count(*) = 4 from exercise_names where name in ('ジョグ', 'スクワット', 'プランク', 'ランジ')),
  '使った種目名が候補に入る');
select ok(
  (select notified_at is null from menus where event_id = '00000000-0000-0000-0000-00000000a001'),
  'コーチが保存しても通知日時は書き換わらない');
select pg_temp.reset_role();

-- ---------------------------------------------------------------------------
-- 選手A
-- ---------------------------------------------------------------------------
select pg_temp.act_as((select id from ids where name = 'a'));
select is((select count(*)::int from menus), 2, '選手は自分の枠のメニューだけ読める');
select is(
  (select count(*)::int from menus where event_id = '00000000-0000-0000-0000-00000000b001'),
  0, '選手Aは選手Bのメニューを読めない');
select throws_ok(
  $$ insert into menus (event_id, blocks) values ('00000000-0000-0000-0000-00000000a003', pg_temp.menu()) $$,
  '42501', null, '選手はメニューを作れない');
select is_empty(
  $$ update menus set blocks = pg_temp.menu('x') where event_id = '00000000-0000-0000-0000-00000000a001' returning 1 $$,
  '選手はメニューを変更できない');
select is_empty(
  $$ delete from menus where event_id = '00000000-0000-0000-0000-00000000a001' returning 1 $$,
  '選手はメニューを削除できない');
select is((select count(*)::int from exercise_names), 0, '選手には種目名の候補が1件も見えない');

-- メニューが入った枠
select throws_ok(
  $$ delete from events where id = '00000000-0000-0000-0000-00000000a001' $$,
  'P0001', 'メニューが入った予定は削除できません。中止にしてください', 'メニューが入った枠は削除できない');
select throws_ok(
  $$ update events set kind = 'swim' where id = '00000000-0000-0000-0000-00000000a001' $$,
  'P0001', 'メニューが入った予定は種類を変更できません', 'メニューが入った枠は種類を変えられない');
select lives_ok(
  $$ update events set date = '2026-11-12', start_time = '17:00' where id = '00000000-0000-0000-0000-00000000a001' $$,
  'メニューが入った枠の日時は変更できる');
select is(
  (select changed_from from events where id = '00000000-0000-0000-0000-00000000a001'),
  '{"date": "2026-11-10", "place": "学校", "start_time": "16:00", "duration_min": 40}'::jsonb,
  '変更前の値が残る');
select lives_ok(
  $$ update events set place = '自宅' where id = '00000000-0000-0000-0000-00000000a001' $$,
  'もう一度変更する');
select is(
  (select changed_from ->> 'date' from events where id = '00000000-0000-0000-0000-00000000a001'),
  '2026-11-10', '2回目の変更でも、最初の値のまま');
select lives_ok(
  $$ update events set status = 'canceled', cancel_reason = '発熱' where id = '00000000-0000-0000-0000-00000000a002' $$,
  'メニューが入った枠は中止できる');
select throws_ok(
  $$ select acknowledge_event_change('00000000-0000-0000-0000-00000000a001') $$,
  '42501', null, '選手は「確認済み」にできない');
select pg_temp.reset_role();

-- ---------------------------------------------------------------------------
-- コーチの「確認済み」
-- ---------------------------------------------------------------------------
select pg_temp.act_as((select id from ids where name = 'coach'));
select lives_ok(
  $$ select acknowledge_event_change('00000000-0000-0000-0000-00000000a001') $$,
  'コーチは「確認済み」にできる');
select ok(
  (select changed_from is null and change_ack_at is not null from events
   where id = '00000000-0000-0000-0000-00000000a001'),
  '確認済みにすると「変更あり」が消える');
select pg_temp.reset_role();

select * from finish();
rollback;
