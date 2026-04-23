-- Run in Supabase SQL editor or via CLI migrations.
-- Shared equipment requests (no auth yet; tighten RLS before production).

create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  price numeric not null,
  user_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists requests_created_at_idx on public.requests (created_at desc);

alter table public.requests enable row level security;

-- Open access for MVP (anon key). Replace with authenticated policies later.
create policy "requests_select_all" on public.requests for select using (true);
create policy "requests_insert_all" on public.requests for insert with check (true);
