-- フェーズ5：参考メニュー帳とテンプレート（どちらもコーチ専用。選手には一切見せない）
--
-- ・参考メニュー帳：Web で見つけたメニューのメモ。元ページの文章や画像は保存せず、URL と要点メモで管理する
-- ・テンプレート：メニューと同じブロック形式（validate_menu_blocks で検証）。参考メニュー帳から作れる

create table public.reference_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  -- 出典URL（空でもよい。入れるなら http(s) のみ）
  url text not null default '' check (url = '' or (url ~ '^https?://[^\s]+$' and char_length(url) <= 2000)),
  memo text not null default '' check (char_length(memo) <= 2000),
  tags text[] not null default '{}' check (
    cardinality(tags) <= 10
    and array_position(tags, null) is null
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.reference_notes is '参考メニュー帳（コーチのみ）。出典URLと要点メモ、タグ';

-- タグは1〜20文字（CHECK 制約では配列の各要素を直接見られないので関数で確認する）
create function public.valid_tags(p_tags text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not exists (
    select 1 from unnest(p_tags) t where char_length(btrim(t)) not between 1 and 20
  );
$$;

alter table public.reference_notes add constraint reference_notes_tags_length check (public.valid_tags(tags));

create index reference_notes_tags on public.reference_notes using gin (tags);

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  blocks jsonb not null check (public.validate_menu_blocks(blocks)),
  -- 元にした参考メニュー（削除されたら空にする）
  reference_note_id uuid references public.reference_notes (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.templates is 'メニューのテンプレート（コーチのみ）。形式は menus.blocks と同じ';

create index templates_reference_note on public.templates (reference_note_id);

alter table public.reference_notes enable row level security;
alter table public.templates enable row level security;

-- コーチだけがすべての操作をできる。選手向けのポリシーは作らない（＝何も見えない）
create policy reference_notes_coach on public.reference_notes
  for all to authenticated
  using ((select public.is_coach()))
  with check ((select public.is_coach()));

create policy templates_coach on public.templates
  for all to authenticated
  using ((select public.is_coach()))
  with check ((select public.is_coach()));

revoke all on table public.reference_notes from anon;
revoke all on table public.templates from anon;

-- 更新日時
create trigger reference_notes_set_updated_at
  before update on public.reference_notes
  for each row execute function public.set_updated_at();

create trigger templates_set_updated_at
  before update on public.templates
  for each row execute function public.set_updated_at();

-- テンプレートで使った種目名も候補に入れる（メニューと同じ関数）
create trigger templates_20_collect_exercise_names
  after insert or update of blocks on public.templates
  for each row execute function public.menus_collect_exercise_names();

revoke all on function public.valid_tags(text[]) from public, anon;
