-- Repair migration if 068 failed mid-run (constraint drop + data normalize + re-add).
-- Safe to run multiple times.

alter table public.rentals
  drop constraint if exists rentals_cancellation_status_check;

update public.rentals
set cancellation_status = 'cancelled'
where cancellation_status in ('accepted', 'completed');

update public.rentals
set cancellation_status = 'cancelled'
where status = 'cancelled'
  and cancellation_status is distinct from 'cancelled';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rentals_cancellation_status_check'
      and conrelid = 'public.rentals'::regclass
  ) then
    alter table public.rentals
      add constraint rentals_cancellation_status_check
      check (cancellation_status in ('none', 'requested', 'declined', 'cancelled'));
  end if;
end $$;
