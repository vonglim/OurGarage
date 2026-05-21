-- Bilateral meetup presence for pickup handoff (independent of meetup coordination complete).

alter table public.rentals
  add column if not exists owner_arrived_at timestamptz null,
  add column if not exists renter_arrived_at timestamptz null;

comment on column public.rentals.owner_arrived_at is
  'Owner tapped I am here at pickup meetup.';
comment on column public.rentals.renter_arrived_at is
  'Renter tapped I am here at pickup meetup (mirrors wizard renter_pickup_im_here_at).';
