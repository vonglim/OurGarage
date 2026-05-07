-- Align `public.rentals` with the current rental proposal + confirmation app contract.
-- Safe/idempotent for environments that missed migration 027.

alter table public.rentals
  add column if not exists pickup_datetime timestamptz null,
  add column if not exists return_datetime timestamptz null,
  add column if not exists owner_confirmed boolean not null default false,
  add column if not exists renter_confirmed boolean not null default false,
  add column if not exists agreement_status text not null default 'pending',
  add column if not exists confirmed_at timestamptz null,
  add column if not exists last_proposed_by uuid null references public.profiles (id) on delete set null,
  add column if not exists proposal_version integer not null default 1,
  add column if not exists proposal_updated_at timestamptz not null default now(),
  add column if not exists latest_proposal_message_id uuid null references public.offer_messages (id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rentals_agreement_status_check'
      and conrelid = 'public.rentals'::regclass
  ) then
    alter table public.rentals
      add constraint rentals_agreement_status_check
      check (agreement_status in ('pending', 'confirmed'));
  end if;
end $$;

-- Backfill newly introduced agreement/proposal columns from legacy fields.
update public.rentals
set
  pickup_datetime = coalesce(pickup_datetime, meetup_time),
  return_datetime = coalesce(return_datetime, return_time),
  owner_confirmed = coalesce(owner_confirmed, confirmed_by_owner, false),
  renter_confirmed = coalesce(renter_confirmed, confirmed_by_renter, false),
  agreement_status = case
    when coalesce(owner_confirmed, confirmed_by_owner, false)
      and coalesce(renter_confirmed, confirmed_by_renter, false)
      then 'confirmed'
    else 'pending'
  end,
  proposal_version = coalesce(proposal_version, 1),
  proposal_updated_at = coalesce(proposal_updated_at, now()),
  confirmed_at = case
    when coalesce(owner_confirmed, confirmed_by_owner, false)
      and coalesce(renter_confirmed, confirmed_by_renter, false)
      then coalesce(confirmed_at, now())
    else null
  end;
