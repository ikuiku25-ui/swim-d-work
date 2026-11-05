-- templates・reference_notes（コーチ専用）のテスト
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(18);

delete from auth.users;
-- seed の参考メニュー・テンプレートがあっても結果が変わらないよう、空の状態から始める（最後に rollback）
delete from templates;
delete from reference_notes;

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
  select '[{"id":"b1","type":"single","sets":3,"rest_sec":60,"memo":"",
            "exercise":{"id":"e1","name":"バードドッグ","value":10,"unit":"reps","load":"自重","memo":""}}]'::jsonb;
$$;

create temp table ids (name text primary key, id uuid);
grant select on ids to authenticated;
insert into ids values
  ('coach', pg_temp.new_user('coach@example.com', 'コーチ')),
  ('a',     pg_temp.new_user('a@example.com', '選手A'));

-- ---------------------------------------------------------------------------
-- コーチ
-- ---------------------------------------------------------------------------
select pg_temp.act_as((select id from ids where name = 'coach'));
select lives_ok(
  $$ insert into reference_notes (id, title, url, memo, tags)
     values ('00000000-0000-0000-0000-00000000f001', '肩甲骨まわりの安定化サーキット',
             'https://example.com/shoulder', '回数は少なめに', '{肩,体幹}') $$,
  'コーチは参考メニューを登録できる');
select lives_ok(
  $$ insert into reference_notes (title) values ('URL なしのメモ') $$,
  '出典URLは空でもよい');
select throws_ok(
  $$ insert into reference_notes (title, url) values ('x', 'javascript:alert(1)') $$,
  '23514', null, 'URL は http(s) だけ');
select throws_ok(
  $$ insert into reference_notes (title) values ('   ') $$,
  '23514', null, 'タイトルは空にできない');
select throws_ok(
  $$ insert into reference_notes (title, tags) values ('x', array[repeat('あ', 21)]) $$,
  '23514', null, 'タグは20文字まで');
select throws_ok(
  $$ insert into reference_notes (title, tags) values ('x', '{1,2,3,4,5,6,7,8,9,10,11}') $$,
  '23514', null, 'タグは10個まで');
select is(
  (select count(*)::int from reference_notes where tags @> '{肩}'), 1, 'タグで絞り込める');

select lives_ok(
  $$ insert into templates (id, title, blocks, reference_note_id)
     values ('00000000-0000-0000-0000-00000000f101', '肩の安定化', pg_temp.menu(), '00000000-0000-0000-0000-00000000f001') $$,
  'コーチは参考メニューからテンプレートを作れる');
select throws_ok(
  $$ insert into templates (title, blocks) values ('空', '[]') $$,
  '23514', null, 'テンプレートもメニューと同じ形式チェック');
select ok(exists (select 1 from exercise_names where name = 'バードドッグ'), 'テンプレートの種目名も候補に入る');
select lives_ok(
  $$ update templates set title = '肩の安定化（改）' where id = '00000000-0000-0000-0000-00000000f101' $$,
  'コーチはテンプレートを編集できる');
select lives_ok(
  $$ delete from reference_notes where id = '00000000-0000-0000-0000-00000000f001' $$,
  '参考メニューを削除できる');
select ok(
  (select reference_note_id is null from templates where id = '00000000-0000-0000-0000-00000000f101'),
  '参考メニューを削除しても、テンプレートは残る（元の参照だけ外れる）');
select pg_temp.reset_role();

-- ---------------------------------------------------------------------------
-- 選手：何も見えず、何も書けない
-- ---------------------------------------------------------------------------
select pg_temp.act_as((select id from ids where name = 'a'));
select is((select count(*)::int from templates), 0, '選手にはテンプレートが見えない');
select is((select count(*)::int from reference_notes), 0, '選手には参考メニュー帳が見えない');
select throws_ok(
  $$ insert into templates (title, blocks) values ('x', pg_temp.menu()) $$,
  '42501', null, '選手はテンプレートを作れない');
select throws_ok(
  $$ insert into reference_notes (title) values ('x') $$,
  '42501', null, '選手は参考メニューを登録できない');
select is_empty(
  $$ delete from templates returning 1 $$,
  '選手はテンプレートを削除できない');
select pg_temp.reset_role();

select * from finish();
rollback;
