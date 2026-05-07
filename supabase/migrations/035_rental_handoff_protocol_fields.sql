-- Bilateral handoff protocol + agreement/payment placeholders.

alter table public.rentals
  add column if not exists owner_pickup_ready boolean not null default false,
  add column if not exists renter_pickup_ready boolean not null default false,
  add column if not exists owner_return_ready boolean not null default false,
  add column if not exists renter_return_ready boolean not null default false,
  add column if not exists handoff_approved_by_owner boolean not null default false,
  add column if not exists handoff_approved_by_renter boolean not null default false,
  add column if not exists handoff_approval_started_at timestamptz null,
  add column if not exists signed_at timestamptz null,
  add column if not exists signed_name text null,
  add column if not exists agreement_version integer not null default 1,
  add column if not exists preauth_status text not null default 'not_started',
  add column if not exists preauth_amount numeric(10,2) null,
  add column if not exists preauth_authorized_at timestamptz null,
  add column if not exists daily_late_fee numeric(10,2) null,
  add column if not exists grace_period_hours integer not null default 0,
  add column if not exists replacement_value numeric(10,2) null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rentals_preauth_status_check'
      and conrelid = 'public.rentals'::regclass
  ) then
    alter table public.rentals
      add constraint rentals_preauth_status_check
      check (preauth_status in ('not_started', 'pending', 'authorized', 'failed', 'released'));
  end if;
end $$;
