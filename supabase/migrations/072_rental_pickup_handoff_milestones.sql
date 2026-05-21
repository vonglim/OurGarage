-- Canonical pickup handoff milestone timestamps (possession transfer ≠ meetup presence).

alter table public.rentals
  add column if not exists renter_confirmed_receipt_at timestamptz null,
  add column if not exists owner_confirmed_handoff_at timestamptz null,
  add column if not exists possession_transferred_at timestamptz null,
  add column if not exists pickup_handoff_completed_at timestamptz null;

comment on column public.rentals.renter_confirmed_receipt_at is
  'Renter confirmed physical receipt at pickup meetup.';
comment on column public.rentals.owner_confirmed_handoff_at is
  'Owner confirmed physical handoff at pickup meetup.';
comment on column public.rentals.possession_transferred_at is
  'Bilateral possession transfer recorded (both parties confirmed pickup).';
comment on column public.rentals.pickup_handoff_completed_at is
  'Pickup handoff lane complete; equipment-out / active rental may proceed.';
