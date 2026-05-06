-- Return handoff: mirror pickup meetup fields.
alter table public.rentals add column if not exists return_time timestamptz null;
alter table public.rentals add column if not exists return_location text null;
