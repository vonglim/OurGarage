alter table public.rentals add column if not exists meetup_time timestamptz null;
alter table public.rentals add column if not exists meetup_location text null;
alter table public.rentals add column if not exists confirmed_by_renter boolean not null default false;
alter table public.rentals add column if not exists confirmed_by_owner boolean not null default false;
