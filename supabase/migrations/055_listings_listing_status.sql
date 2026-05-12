-- Lifecycle for marketplace listings (browse filters on this in the app).
alter table if exists public.listings
  add column if not exists listing_status text;

update public.listings
set listing_status = 'active'
where listing_status is null or listing_status = '';

alter table if exists public.listings
  alter column listing_status set default 'active';

alter table if exists public.listings
  alter column listing_status set not null;

comment on column public.listings.listing_status is 'active | paused | draft | archived';
