-- ローカル開発用のユーザー（本番には入らない）
-- 最初に入れたユーザーがコーチになる（handle_new_user トリガー）
-- ログインは http://localhost:5173 でメールアドレスを入力し、
-- 届いたコードを Mailpit（http://127.0.0.1:54324）で確認する
do $$
declare
  u record;
begin
  for u in
    select * from (values
      (1, '00000000-0000-0000-0000-0000000000c1'::uuid, 'coach@example.com', 'コーチ'),
      (2, '00000000-0000-0000-0000-0000000000a1'::uuid, 'athlete-a@example.com', '選手A'),
      (3, '00000000-0000-0000-0000-0000000000a2'::uuid, 'athlete-b@example.com', '選手B')
    ) as t(ord, id, email, name)
    order by ord
  loop
    insert into auth.users (
      id, instance_id, aud, role, email, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      u.email, now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', u.name),
      now(), now(), '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
    values (
      gen_random_uuid(), u.id, u.id::text, 'email',
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
      now(), now()
    );
  end loop;
end $$;
