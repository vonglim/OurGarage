-- Request match + rental rows (MVP: open RLS, tighten later)

alter table public.requests add column if not exists matched boolean not null default false;
alter table public.requests add column if not exists accepted_offer_id uuid;
alter table public.requests add column if not exists accepted_price numeric;

create table if not exists public.rentals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  offer_id uuid not null,
  owner_id text not null,
  renter_id text not null,
  price numeric not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create index if not exists rentals_request_id_idx on public.rentals (request_id);

alter table public.rentals enable row level security;
create policy "rentals_select_all" on public.rentals for select using (true);
create policy "rentals_insert_all" on public.rentals for insert with check (true);

drop policy if exists "requests_update_all" on public.requests;
create policy "requests_update_all" on public.requests for update using (true) with check (true);
