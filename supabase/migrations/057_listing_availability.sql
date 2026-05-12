-- Canonical listing calendar: owner blocks, negotiation holds, booked rentals.
-- Inclusive date ranges: [start_date, end_date].

create table if not exists public.listing_availability (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  availability_type text not null,
  source_offer_id uuid references public.offers (id) on delete cascade,
  source_request_id uuid,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  constraint listing_availability_date_order check (start_date <= end_date),
  constraint listing_availability_type_check check (
    availability_type in ('blocked', 'pending', 'booked')
  )
);

create index if not exists listing_availability_listing_start_idx
  on public.listing_availability (listing_id, start_date);

create index if not exists listing_availability_listing_type_idx
  on public.listing_availability (listing_id, availability_type);

create index if not exists listing_availability_source_offer_idx
  on public.listing_availability (source_offer_id)
  where source_offer_id is not null;

comment on table public.listing_availability is
  'Time blocks for listings: blocked (owner), pending (negotiation hold), booked (accepted rental).';

comment on column public.listing_availability.availability_type is 'blocked | pending | booked';

-- Offer rows carry chosen rental window for listing-linked threads (nullable for legacy rows).
alter table public.offers add column if not exists rental_start_date date;

alter table public.offers add column if not exists rental_end_date date;

comment on column public.offers.rental_start_date is 'Listing offer / rental: inclusive start (date-only).';

comment on column public.offers.rental_end_date is 'Listing offer / rental: inclusive end (date-only).';

alter table public.listing_availability enable row level security;

-- Anyone can read availability (browse + offer flow + calendar UX).
drop policy if exists "listing_availability_select_all" on public.listing_availability;
create policy "listing_availability_select_all" on public.listing_availability
  for select using (true);

-- Owner-only: manual blackout.
drop policy if exists "listing_availability_insert_blocked_owner" on public.listing_availability;
create policy "listing_availability_insert_blocked_owner" on public.listing_availability
  for insert
  with check (
    availability_type = 'blocked'
    and auth.uid() is not null
    and created_by_user_id = auth.uid()
    and exists (
      select 1 from public.listings l
      where l.id = listing_id
        and (l.user_id)::text = (auth.uid())::text
    )
  );

-- Renter: negotiation hold (not on own listing).
drop policy if exists "listing_availability_insert_pending_renter" on public.listing_availability;
create policy "listing_availability_insert_pending_renter" on public.listing_availability
  for insert
  with check (
    availability_type = 'pending'
    and auth.uid() is not null
    and created_by_user_id = auth.uid()
    and exists (
      select 1 from public.listings l
      where l.id = listing_id
        and (l.user_id)::text <> (auth.uid())::text
    )
  );

-- Owner: mark booked (e.g. after accepting an offer); server-side jobs can use service role later.
drop policy if exists "listing_availability_insert_booked_owner" on public.listing_availability;
create policy "listing_availability_insert_booked_owner" on public.listing_availability
  for insert
  with check (
    availability_type = 'booked'
    and auth.uid() is not null
    and exists (
      select 1 from public.listings l
      where l.id = listing_id
        and (l.user_id)::text = (auth.uid())::text
    )
  );

drop policy if exists "listing_availability_update_owner_listing" on public.listing_availability;
create policy "listing_availability_update_owner_listing" on public.listing_availability
  for update
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id
        and (l.user_id)::text = (auth.uid())::text
    )
  );

drop policy if exists "listing_availability_delete_owner_blocked" on public.listing_availability;
create policy "listing_availability_delete_owner_blocked" on public.listing_availability
  for delete
  using (
    availability_type = 'blocked'
    and exists (
      select 1 from public.listings l
      where l.id = listing_id
        and (l.user_id)::text = (auth.uid())::text
    )
  );

drop policy if exists "listing_availability_delete_renter_pending" on public.listing_availability;
create policy "listing_availability_delete_renter_pending" on public.listing_availability
  for delete
  using (
    availability_type = 'pending'
    and created_by_user_id = auth.uid()
  );

-- Host can remove negotiation holds on their listing (e.g. offer declined).
drop policy if exists "listing_availability_delete_owner_pending_listing" on public.listing_availability;
create policy "listing_availability_delete_owner_pending_listing" on public.listing_availability
  for delete
  using (
    availability_type = 'pending'
    and exists (
      select 1 from public.listings l
      where l.id = listing_id
        and (l.user_id)::text = (auth.uid())::text
    )
  );
