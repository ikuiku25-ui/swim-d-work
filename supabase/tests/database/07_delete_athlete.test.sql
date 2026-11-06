-- 選手の削除（Auth のユーザー削除）で、その選手のデータがまとめて消え、ほかには影響しないこと
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(9);

delete from auth.users;
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

create temp table ids (name text primary key, id uuid);
insert into ids values
  ('coach', pg_temp.new_user('coach@example.com', 'コーチ')),
  ('a',     pg_temp.new_user('a@example.com', '選手A')),
  ('b',     pg_temp.new_user('b@example.com', '選手B'));

-- 選手A：メニュー入り・記録開始済みの枠、中止履歴、購読、コーチ宛て通知
insert into events (id, athlete_id, kind, date, start_time, place, duration_min) values
  ('00000000-0000-0000-0000-00000000a001', (select id from ids where name = 'a'), 'dryland', '2026-11-10', '16:00', '学校', 40),
  ('00000000-0000-0000-0000-00000000a002', (select id from ids where name = 'a'), 'dryland', '2026-11-11', '16:00', '学校', 40),
  ('00000000-0000-0000-0000-00000000b001', (select id from ids where name = 'b'), 'dryland', '2026-11-10', '17:00', '自宅', 30);
insert into menus (event_id, blocks) values
  ('00000000-0000-0000-0000-00000000a001', '[{"id":"b1","type":"single","sets":1,"rest_sec":0,"memo":"","exercise":{"id":"e1","name":"ジョグ","value":300,"unit":"sec","load":"","memo":""}}]'),
  ('00000000-0000-0000-0000-00000000b001', '[{"id":"b1","type":"single","sets":1,"rest_sec":0,"memo":"","exercise":{"id":"e1","name":"ジョグ","value":300,"unit":"sec","load":"","memo":""}}]');
insert into records (event_id, exercise_results, completed_at)
  values ('00000000-0000-0000-0000-00000000a001', '{"e1":{"checked":true,"value":null,"load":null}}', now());
update events set status = 'canceled', cancel_reason = '発熱' where id = '00000000-0000-0000-0000-00000000a002';
insert into push_subscriptions (user_id, endpoint, p256dh, auth)
  values ((select id from ids where name = 'a'), 'https://web.push.apple.com/a', 'p', 'k');
insert into notifications (recipient_id, kind, payload)
  values ((select id from ids where name = 'coach'), 'event_added_late', '{"athlete_name":"選手A"}');
insert into templates (title, blocks) values ('残る', '[{"id":"b1","type":"single","sets":1,"rest_sec":0,"memo":"","exercise":{"id":"e1","name":"ジョグ","value":300,"unit":"sec","load":"","memo":""}}]');

select ok((select started from records where event_id = '00000000-0000-0000-0000-00000000a001'), '（準備）記録開始済みの枠がある');

-- 削除（Edge Function delete-athlete は auth.admin.deleteUser でこれと同じことをする）
select lives_ok(
  $$ delete from auth.users where id = (select id from ids where name = 'a') $$,
  'メニュー入り・記録済みの枠があっても、選手のアカウントは削除できる');

select is((select count(*)::int from profiles where id = (select id from ids where name = 'a')), 0, 'プロフィールが消える');
select is((select count(*)::int from events where athlete_id = (select id from ids where name = 'a')), 0, '予定が消える');
select is((select count(*)::int from menus where event_id in ('00000000-0000-0000-0000-00000000a001')), 0, 'メニューが消える');
select is((select count(*)::int from records), 0, '実施記録が消える');
select is((select count(*)::int from push_subscriptions), 0, '通知の購読が消える');
select is((select count(*)::int from events where athlete_id = (select id from ids where name = 'b')), 1, 'ほかの選手の予定は残る');
select is((select count(*)::int from templates), 1, 'テンプレートは残る');

select * from finish();
rollback;
