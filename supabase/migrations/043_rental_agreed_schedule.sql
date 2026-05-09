-- Canonical accepted-request schedule (immutable baseline for meetup coordination + duration warnings).
alter table public.rentals
  add column if not exists agreed_pickup_datetime timestamptz null,
  add column if not exists agreed_return_datetime timestamptz null;

comment on column public.rentals.agreed_pickup_datetime is
  'Pickup date/time from the accepted request agreement (baseline; not the same as proposal drafts).';
comment on column public.rentals.agreed_return_datetime is
  'Return date/time from the accepted request agreement (baseline; not the same as proposal drafts).';

-- Backfill from existing operational meetup fields where baseline was never stored.
update public.rentals
set
  agreed_pickup_datetime = coalesce(
    agreed_pickup_datetime,
    pickup_datetime,
    meetup_time
  ),
  agreed_return_datetime = coalesce(
    agreed_return_datetime,
    return_datetime,
    return_time
  )
where agreed_pickup_datetime is null
   or agreed_return_datetime is null;
