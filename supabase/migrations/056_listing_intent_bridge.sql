-- Bridge: listing-aware rental intent (rental_requests) and listing-linked offers (offers).
-- Does not duplicate the generic `requests` table.

-- --- rental_requests: snapshot + renter intent fields ---
alter table public.rental_requests add column if not exists listing_snapshot jsonb;

alter table public.rental_requests add column if not exists requested_start_date date;

alter table public.rental_requests add column if not exists requested_end_date date;

alter table public.rental_requests add column if not exists handoff_preference text;

alter table public.rental_requests add column if not exists renter_message text;

comment on column public.rental_requests.listing_snapshot is
  'Frozen listing summary at intent time (title, hero image, daily price, condition, delivery).';

-- Allow explicit multi-day rental (was incorrectly folded into full-day only).
alter table public.rental_requests drop constraint if exists rental_requests_duration_type_check;

alter table public.rental_requests
  add constraint rental_requests_duration_type_check
  check (duration_type in ('half', 'full', 'week', 'multi_day'));

-- --- offers: listing-linked negotiation threads (no generic request row) ---
alter table public.offers add column if not exists listing_id uuid references public.listings (id) on delete set null;

alter table public.offers add column if not exists listing_snapshot jsonb;

comment on column public.offers.listing_id is 'When set, this offer thread is against a published listing (renter proposes terms).';

comment on column public.offers.listing_snapshot is 'Listing summary at first offer write; survives listing edits.';

-- Listing threads use null request_id; legacy rows keep request_id.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'offers'
      and column_name = 'request_id'
      and is_nullable = 'NO'
  ) then
    alter table public.offers alter column request_id drop not null;
  end if;
end $$;

drop index if exists offers_request_id_user_id_key;

create unique index if not exists offers_request_renter_unique
  on public.offers (request_id, user_id)
  where request_id is not null;

create unique index if not exists offers_listing_renter_unique
  on public.offers (listing_id, user_id)
  where listing_id is not null;