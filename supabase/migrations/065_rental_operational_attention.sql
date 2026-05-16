-- Operational attention flags for missed meetups + internal trust reports (no moderation UI yet).

alter table public.rentals
  add column if not exists pickup_operational_state text null,
  add column if not exists return_operational_state text null;

alter table public.rentals drop constraint if exists rentals_pickup_operational_state_check;
alter table public.rentals
  add constraint rentals_pickup_operational_state_check
  check (
    pickup_operational_state is null
    or pickup_operational_state in ('missed_confirmation', 'running_late', 'no_show_reported')
  );

alter table public.rentals drop constraint if exists rentals_return_operational_state_check;
alter table public.rentals
  add constraint rentals_return_operational_state_check
  check (
    return_operational_state is null
    or return_operational_state in ('missed_confirmation', 'running_late', 'no_show_reported')
  );

comment on column public.rentals.pickup_operational_state is
  'Client-set operational attention: missed_confirmation | running_late | no_show_reported';
comment on column public.rentals.return_operational_state is
  'Client-set operational attention for return window';

alter table public.profiles
  add column if not exists operational_report_count integer not null default 0;

create table if not exists public.user_operational_reports (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rentals (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_user_id uuid not null references public.profiles (id) on delete cascade,
  report_type text not null,
  created_at timestamptz not null default now()
);

alter table public.user_operational_reports drop constraint if exists user_operational_reports_type_check;
alter table public.user_operational_reports
  add constraint user_operational_reports_type_check
  check (report_type in ('pickup_no_show', 'return_no_show', 'missed_meetup', 'operational_issue'));

create index if not exists user_operational_reports_target_idx
  on public.user_operational_reports (target_user_id, created_at desc);

create index if not exists user_operational_reports_rental_idx
  on public.user_operational_reports (rental_id);

alter table public.user_operational_reports enable row level security;

drop policy if exists "user_operational_reports_insert_reporter" on public.user_operational_reports;
create policy "user_operational_reports_insert_reporter" on public.user_operational_reports
  for insert to authenticated
  with check (reporter_id = auth.uid());

drop policy if exists "user_operational_reports_select_parties" on public.user_operational_reports;
create policy "user_operational_reports_select_parties" on public.user_operational_reports
  for select to authenticated
  using (reporter_id = auth.uid() or target_user_id = auth.uid());
