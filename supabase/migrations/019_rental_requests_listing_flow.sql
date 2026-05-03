-- Listing-based rental_requests (tool listings). Parallel to request/offer `rentals` table.

create table if not exists public.rental_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  renter_user_id uuid not null,
  duration_type text not null,
  price numeric not null,
  status text not null default 'pending',
  owner_user_id uuid,
  created_at timestamptz not null default now(),
  constraint rental_requests_duration_type_check check (duration_type in ('half', 'full', 'week'))
);

alter table public.rental_requests
  add column if not exists owner_user_id uuid;

create index if not exists rental_requests_renter_created_idx
  on public.rental_requests (renter_user_id, created_at desc);

create index if not exists rental_requests_owner_created_idx
  on public.rental_requests (owner_user_id, created_at desc);

create index if not exists rental_requests_status_created_idx
  on public.rental_requests (status, created_at desc);

alter table public.rental_requests enable row level security;

drop policy if exists "rental_requests_select_parties" on public.rental_requests;
create policy "rental_requests_select_parties" on public.rental_requests
  for select
  using (renter_user_id = auth.uid() or owner_user_id = auth.uid());

drop policy if exists "rental_requests_insert_renter" on public.rental_requests;
create policy "rental_requests_insert_renter" on public.rental_requests
  for insert
  with check (renter_user_id = auth.uid());

drop policy if exists "rental_requests_update_parties" on public.rental_requests;
create policy "rental_requests_update_parties" on public.rental_requests
  for update
  using (
    renter_user_id = auth.uid()
    or owner_user_id = auth.uid()
  );

comment on table public.rental_requests is 'Rental requests against listings; status approved drives Activity Rentals tab.';

-- Notifications when a row becomes approved (both renter and listing owner).

create or replace function public.notify_on_rental_request_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from 'approved' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from 'approved' then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, message, read, data)
  values (
    new.renter_user_id,
    'rental_confirmed',
    'Rental approved',
    'Your rental request was accepted.',
    'Your rental request was accepted.',
    false,
    jsonb_build_object('listingId', new.listing_id::text)
  );

  if new.owner_user_id is not null and new.owner_user_id is distinct from new.renter_user_id then
    insert into public.notifications (user_id, type, title, body, message, read, data)
    values (
      new.owner_user_id,
      'rental_confirmed',
      'Rental confirmed',
      'A rental was approved on your listing.',
      'A rental was approved on your listing.',
      false,
      jsonb_build_object('listingId', new.listing_id::text)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists rental_requests_notify_approved_ins on public.rental_requests;
create trigger rental_requests_notify_approved_ins
  after insert on public.rental_requests
  for each row
  when (new.status = 'approved')
  execute function public.notify_on_rental_request_approved();

drop trigger if exists rental_requests_notify_approved_upd on public.rental_requests;
create trigger rental_requests_notify_approved_upd
  after update on public.rental_requests
  for each row
  when (new.status = 'approved' and old.status is distinct from new.status)
  execute function public.notify_on_rental_request_approved();
