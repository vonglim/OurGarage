-- Single negotiation thread per (request_id, renter user_id).
-- Run in Supabase SQL editor after 001_requests.sql.

alter table public.offers add column if not exists current_price numeric;
alter table public.offers add column if not exists last_updated_by text;
alter table public.offers add column if not exists status text not null default 'pending';
alter table public.offers add column if not exists poster_counter_count int not null default 0;
alter table public.offers add column if not exists updated_at timestamptz;

update public.offers
set
  current_price = coalesce(current_price, price),
  last_updated_by = coalesce(last_updated_by, user_id),
  updated_at = coalesce(updated_at, created_at, now())
where true;

-- Remove duplicate (request_id, user_id) rows before creating the unique index (manual cleanup if this fails).
create unique index if not exists offers_request_id_user_id_key on public.offers (request_id, user_id);

create table if not exists public.offer_messages (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers (id) on delete cascade,
  author_id text not null,
  body text,
  price numeric,
  kind text not null default 'note',
  created_at timestamptz not null default now()
);

create index if not exists offer_messages_offer_id_idx on public.offer_messages (offer_id);

alter table public.offer_messages enable row level security;
create policy "offer_messages_select_all" on public.offer_messages for select using (true);
create policy "offer_messages_insert_all" on public.offer_messages for insert with check (true);
