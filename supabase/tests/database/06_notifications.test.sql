-- 通知：締切の判定、コーチ宛て通知の条件、購読の RLS
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(25);

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

create function pg_temp.today() returns date language sql as $$ select (now() at time zone 'Asia/Tokyo')::date $$;
create function pg_temp.queued(p_kind text) returns integer
language sql as $$ select count(*)::int from notifications where kind = p_kind $$;

create temp table ids (name text primary key, id uuid);
grant select on ids to authenticated;
grant execute on function pg_temp.today() to authenticated;
insert into ids values
  ('coach', pg_temp.new_user('coach@example.com', 'コーチ')),
  ('a',     pg_temp.new_user('a@example.com', '選手A')),
  ('b',     pg_temp.new_user('b@example.com', '選手B'));

-- ---------------------------------------------------------------------------
-- 締切の判定（日本時間）
-- ---------------------------------------------------------------------------
select ok(is_after_deadline('2026-11-10', '2026-11-10T01:00:00Z'), '当日分は締切後（11/10 10:00 JST）');
select ok(not is_after_deadline('2026-11-11', '2026-11-10T12:59:00Z'), '翌日分は21:59までは締切前');
select ok(is_after_deadline('2026-11-11', '2026-11-10T13:00:00Z'), '翌日分は22:00から締切後');
select ok(not is_after_deadline('2026-11-12', '2026-11-10T14:00:00Z'), '明後日分は締切前');
select ok(is_after_deadline('2026-11-11', '2026-11-10T15:30:00Z'), '日付が変わったら当日分（00:30 JST）');

-- ---------------------------------------------------------------------------
-- 選手Aの操作
-- ---------------------------------------------------------------------------
select pg_temp.act_as((select id from ids where name = 'a'));
insert into events (id, kind, date, start_time, place, duration_min) values
  ('00000000-0000-0000-0000-00000000a001', 'dryland', pg_temp.today(), '16:00', '学校', 40);
select pg_temp.reset_role();
select is(pg_temp.queued('event_added_late'), 1, '当日にメニュー未設定の枠を追加すると、コーチへの通知がたまる');
select is(
  (select payload ->> 'athlete_name' from notifications limit 1), '選手A', '通知には選手名が入る');
select is(
  (select recipient_id from notifications limit 1), (select id from ids where name = 'coach'), '宛先はコーチ');

select pg_temp.act_as((select id from ids where name = 'a'));
insert into events (id, kind, date, start_time, place, duration_min) values
  ('00000000-0000-0000-0000-00000000a002', 'dryland', pg_temp.today() + 5, '16:00', '学校', 40),
  ('00000000-0000-0000-0000-00000000a003', 'swim', pg_temp.today(), '18:00', 'プール', 90);
select pg_temp.reset_role();
select is(pg_temp.queued('event_added_late'), 1, '締切前の追加と、水中練習の追加は通知しない');

select pg_temp.act_as((select id from ids where name = 'a'));
update events set place = '自宅' where id = '00000000-0000-0000-0000-00000000a001';
select pg_temp.reset_role();
select is(pg_temp.queued('event_added_late'), 1, 'メニュー未設定の枠の場所だけの変更は通知しない');

select pg_temp.act_as((select id from ids where name = 'a'));
update events set date = pg_temp.today() where id = '00000000-0000-0000-0000-00000000a002';
select pg_temp.reset_role();
select is(pg_temp.queued('event_added_late'), 2, '締切後の日付に移動すると通知がたまる');
select ok(
  (select payload ? 'from' from notifications where payload ->> 'event_id' = '00000000-0000-0000-0000-00000000a002'),
  '移動のときは移動前の日時も入る');

select pg_temp.act_as((select id from ids where name = 'a'));
update events set status = 'canceled', cancel_reason = '雨' where id = '00000000-0000-0000-0000-00000000a002';
select pg_temp.reset_role();
select is(pg_temp.queued('event_canceled'), 0, 'メニュー未設定の枠の中止は通知しない');

-- メニューが入った枠（コーチがメニューを入れる）
select pg_temp.act_as((select id from ids where name = 'a'));
insert into events (id, kind, date, start_time, place, duration_min) values
  ('00000000-0000-0000-0000-00000000a004', 'dryland', pg_temp.today() + 10, '16:00', '学校', 40);
select pg_temp.reset_role();
insert into menus (event_id, blocks) values ('00000000-0000-0000-0000-00000000a004',
  '[{"id":"b1","type":"single","sets":1,"rest_sec":0,"memo":"","exercise":{"id":"e1","name":"ジョグ","value":300,"unit":"sec","load":"","memo":""}}]');

select pg_temp.act_as((select id from ids where name = 'a'));
update events set start_time = '17:00' where id = '00000000-0000-0000-0000-00000000a004';
select pg_temp.reset_role();
select is(pg_temp.queued('event_changed'), 1, 'メニューが入った枠は、締切前でも変更を通知する');
select is(
  (select payload -> 'from' ->> 'start_time' from notifications where kind = 'event_changed'), '16:00',
  '変更前の時刻が入る');

select pg_temp.act_as((select id from ids where name = 'a'));
update events set status = 'canceled', cancel_reason = '発熱' where id = '00000000-0000-0000-0000-00000000a004';
select pg_temp.reset_role();
select is(pg_temp.queued('event_canceled'), 1, 'メニューが入った枠の中止を通知する');
select is(
  (select payload ->> 'reason' from notifications where kind = 'event_canceled'), '発熱', '中止理由が入る');

-- 管理者（seed など）の操作は通知しない
update events set start_time = '08:00' where id = '00000000-0000-0000-0000-00000000a001';
select is((select count(*)::int from notifications), 4, '本人以外（管理者）の操作では通知しない');

-- ---------------------------------------------------------------------------
-- 通知日時だけの更新では、メニューの更新日時は変わらない
-- ---------------------------------------------------------------------------
alter table menus disable trigger menus_10_before_write;
update menus set updated_at = '2026-01-01T00:00:00Z' where event_id = '00000000-0000-0000-0000-00000000a004';
alter table menus enable trigger menus_10_before_write;
select is(
  (select updated_at from menus where event_id = '00000000-0000-0000-0000-00000000a004'),
  '2026-01-01T00:00:00Z'::timestamptz, '（準備）');
update menus set notified_at = now() where event_id = '00000000-0000-0000-0000-00000000a004';
select is(
  (select updated_at from menus where event_id = '00000000-0000-0000-0000-00000000a004'),
  '2026-01-01T00:00:00Z'::timestamptz, '通知日時を書いても、内容の更新日時はそのまま');

-- ---------------------------------------------------------------------------
-- 購読と送信待ちの RLS
-- ---------------------------------------------------------------------------
select pg_temp.act_as((select id from ids where name = 'a'));
select lives_ok(
  $$ select register_push_subscription('https://web.push.apple.com/aaa', 'p', 'k', 'iPhone') $$,
  '選手は自分の端末を登録できる');
select throws_ok('select count(*) from notifications', '42501', null, '選手は送信待ちを読めない');
select pg_temp.reset_role();

select pg_temp.act_as((select id from ids where name = 'b'));
select is((select count(*)::int from push_subscriptions), 0, '他人の購読は見えない');
select lives_ok(
  $$ select register_push_subscription('https://web.push.apple.com/aaa', 'p2', 'k2', 'iPhone') $$,
  '同じ端末を別の人が使うと、購読はその人に移る');
select is((select count(*)::int from push_subscriptions), 1, '移った購読は自分の分として見える');
select pg_temp.reset_role();

select * from finish();
rollback;
