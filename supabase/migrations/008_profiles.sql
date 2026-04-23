-- Public profile names (1:1 with auth.users). App shows names in requests, offers, and DMs.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default 'New User',
  created_at timestamptz not null default now()
);

create index if not exists profiles_created_at_idx on public.profiles (created_at desc);

alter table public.profiles enable row level security;

-- Anyone with the app can read display names.
create policy "profiles_select_all" on public.profiles for select using (true);

-- Authenticated users can insert and update their own row only.
create policy "profiles_insert_self" on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

create policy "profiles_update_self" on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

comment on table public.profiles is 'User-facing display name; one row per auth user.';
