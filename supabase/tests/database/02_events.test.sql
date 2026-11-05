-- events（予定）の RLS とトリガーのテスト
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(30);

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

create temp table ids (name text primary key, id uuid);
grant select, insert on ids to anon, authenticated;

insert into ids values
  ('coach', pg_temp.new_user('coach@example.com', 'コーチ')),
  ('a',     pg_temp.new_user('a@example.com', '選手A')),
  ('b',     pg_temp.new_user('b@example.com', '選手B')),
  ('s',     pg_temp.new_user('s@example.com', '停止中'));

-- 選手Bの予定（管理者として用意）
insert into events (id, athlete_id, kind, date, start_time, place, duration_min)
values ('00000000-0000-0000-0000-00000000b001', (select id from ids where name = 'b'),
        'dryland', '2026-11-10', '16:00', '学校', 40);
-- 停止中の選手の予定
insert into events (id, athlete_id, kind, date, start_time, place, duration_min)
values ('00000000-0000-0000-0000-00000000c001', (select id from ids where name = 's'),
        'swim', '2026-11-10', '18:00', 'プール', 90);
update profiles set is_active = false where id = (select id from ids where name = 's');

-- ---------------------------------------------------------------------------
-- 選手A
-- ---------------------------------------------------------------------------
select pg_temp.act_as((select id from ids where name = 'a'));

select lives_ok(
  $$ insert into events (id, kind, date, start_time, place, duration_min)
     values ('00000000-0000-0000-0000-00000000a001', 'dryland', '2026-11-10', '16:00', '学校', 40) $$,
  '選手は自分の予定を追加できる（athlete_id は自動で自分）');
select is(
  (select athlete_id from events where id = '00000000-0000-0000-0000-00000000a001'),
  (select id from ids where name = 'a'), '追加した予定の持ち主は自分');
select lives_ok(
  $$ insert into events (kind, date, start_time, duration_min) values
     ('swim', '2026-11-11', '06:00', 90), ('meet', '2026-11-12', '09:00', 300) $$,
  '複数の予定をまとめて追加できる（貼り付け）');
select throws_ok(
  $$ insert into events (athlete_id, kind, date, start_time, duration_min)
     values ((select id from ids where name = 'b'), 'dryland', '2026-11-10', '16:00', 40) $$,
  '42501', null, '選手は他人の予定を追加できない');
select is((select count(*)::int from events), 3, '選手は自分の予定だけ読める');
select is(
  (select count(*)::int from events where id = '00000000-0000-0000-0000-00000000b001'),
  0, '選手Aは選手Bの予定を読めない');
select is_empty(
  $$ update events set place = '乗っ取り' where id = '00000000-0000-0000-0000-00000000b001' returning id $$,
  '選手Aは選手Bの予定を更新できない');
select is_empty(
  $$ delete from events where id = '00000000-0000-0000-0000-00000000b001' returning id $$,
  '選手Aは選手Bの予定を削除できない');
select throws_ok(
  $$ update events set athlete_id = (select id from ids where name = 'b')
     where id = '00000000-0000-0000-0000-00000000a001' $$,
  null, null, '予定の持ち主は変更できない');

-- 変更
select lives_ok(
  $$ update events set date = '2026-11-12', start_time = '07:00', place = '自宅', duration_min = 30
     where id = '00000000-0000-0000-0000-00000000a001' $$,
  '自分の予定の日付・時刻・場所・時間を変更できる');
select lives_ok(
  $$ update events set changed_from = '{"date":"2000-01-01"}', change_ack_at = now()
     where id = '00000000-0000-0000-0000-00000000a001' $$,
  'システム管理の列を書き換えようとしてもエラーにはならない');
select ok(
  (select changed_from is null and change_ack_at is null from events
   where id = '00000000-0000-0000-0000-00000000a001'),
  'ただし changed_from / change_ack_at は元の値のまま');

-- 中止
select throws_ok(
  $$ update events set status = 'canceled' where id = '00000000-0000-0000-0000-00000000a001' $$,
  '23514', null, '中止には理由が必要');
select throws_ok(
  $$ update events set status = 'canceled', cancel_reason = '   '
     where id = '00000000-0000-0000-0000-00000000a001' $$,
  '23514', null, '空白だけの理由は不可');
select lives_ok(
  $$ update events set status = 'canceled', cancel_reason = '発熱'
     where id = '00000000-0000-0000-0000-00000000a001' $$,
  '理由を入れれば中止できる');
select is(
  (select reason from event_cancel_history where event_id = '00000000-0000-0000-0000-00000000a001'),
  '発熱', '中止理由が履歴に残る');
select lives_ok(
  $$ update events set status = 'normal' where id = '00000000-0000-0000-0000-00000000a001' $$,
  '中止を取り消せる（理由は自動で消える）');
select ok(
  (select cancel_reason is null from events where id = '00000000-0000-0000-0000-00000000a001'),
  '取り消し後、予定の中止理由は空');
select ok(
  (select restored_at is not null from event_cancel_history
   where event_id = '00000000-0000-0000-0000-00000000a001'),
  '履歴には取り消した日時が入り、理由も残る');
select throws_ok(
  $$ insert into event_cancel_history (event_id, reason)
     values ('00000000-0000-0000-0000-00000000a001', 'x') $$,
  '42501', null, '選手は履歴を直接書けない');

-- 入力値の検証
select throws_ok(
  $$ insert into events (kind, date, start_time, duration_min) values ('dryland', '2026-11-10', '16:00', 0) $$,
  '23514', null, '時間は1分以上');
select throws_ok(
  $$ insert into events (kind, date, start_time, place, duration_min)
     values ('dryland', '2026-11-10', '16:00', repeat('あ', 51), 40) $$,
  '23514', null, '場所は50文字まで');

select lives_ok(
  $$ delete from events where id = '00000000-0000-0000-0000-00000000a001' $$,
  'メニューのない自分の予定は削除できる');
select pg_temp.reset_role();

-- ---------------------------------------------------------------------------
-- コーチ
-- ---------------------------------------------------------------------------
select pg_temp.act_as((select id from ids where name = 'coach'));
select is((select count(*)::int from events), 4, 'コーチは全員の予定を読める（停止中の選手の分も）');
select throws_ok(
  $$ insert into events (kind, date, start_time, duration_min) values ('dryland', '2026-11-10', '16:00', 40) $$,
  '42501', null, 'コーチは予定を追加できない');
select is_empty(
  $$ update events set place = 'x' where id = '00000000-0000-0000-0000-00000000b001' returning id $$,
  'コーチは予定を更新できない');
select is_empty(
  $$ delete from events where id = '00000000-0000-0000-0000-00000000b001' returning id $$,
  'コーチは予定を削除できない');
select pg_temp.reset_role();

-- ---------------------------------------------------------------------------
-- 停止中の選手・未ログイン
-- ---------------------------------------------------------------------------
select pg_temp.act_as((select id from ids where name = 's'));
select is((select count(*)::int from events), 0, '停止中の選手は自分の予定も読めない');
select throws_ok(
  $$ insert into events (kind, date, start_time, duration_min) values ('dryland', '2026-11-10', '16:00', 40) $$,
  '42501', null, '停止中の選手は予定を追加できない');
select pg_temp.reset_role();

select pg_temp.act_as(null);
select throws_ok('select count(*) from events', '42501', null, '未ログインは予定を読めない');
select pg_temp.reset_role();

select * from finish();
rollback;
