-- Kids Sound Match: cloud backup of parents' own packs.
-- Run once in Supabase: SQL Editor -> New query -> paste this file -> Run.
--
-- Every row and every file belongs to one signed-in parent. Row Level Security means each
-- account can only ever read or change its own packs, items and files. Children's game
-- results are never stored here.

create table if not exists public.custom_packs (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name_en text not null default '',
  name_ar text not null default '',
  updated_at bigint not null,          -- milliseconds, set by the app (newest change wins)
  deleted boolean not null default false
);

create table if not exists public.custom_items (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pack_id uuid not null,
  name_en text not null default '',
  name_ar text not null default '',
  picture_kind text not null default 'photo' check (picture_kind in ('photo', 'icon')),
  has_name_ar boolean not null default false,
  has_name_en boolean not null default false,
  has_sound boolean not null default false,
  media_version integer not null default 0,
  updated_at bigint not null,
  deleted boolean not null default false
);

create index if not exists custom_items_user on public.custom_items (user_id);
create index if not exists custom_packs_user on public.custom_packs (user_id);

alter table public.custom_packs enable row level security;
alter table public.custom_items enable row level security;

drop policy if exists "Parents manage their own packs" on public.custom_packs;
create policy "Parents manage their own packs" on public.custom_packs
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Parents manage their own items" on public.custom_items;
create policy "Parents manage their own items" on public.custom_items
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Private file storage: pictures and recordings, in a folder named after the account id.
insert into storage.buckets (id, name, public)
values ('custom-media', 'custom-media', false)
on conflict (id) do nothing;

drop policy if exists "Parents read their own media" on storage.objects;
create policy "Parents read their own media" on storage.objects
  for select to authenticated
  using (bucket_id = 'custom-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Parents add their own media" on storage.objects;
create policy "Parents add their own media" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'custom-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Parents replace their own media" on storage.objects;
create policy "Parents replace their own media" on storage.objects
  for update to authenticated
  using (bucket_id = 'custom-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Parents delete their own media" on storage.objects;
create policy "Parents delete their own media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'custom-media' and (storage.foldername(name))[1] = auth.uid()::text);
