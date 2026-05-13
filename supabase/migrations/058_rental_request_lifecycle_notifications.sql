-- Listing rental lifecycle: owner/renter notifications + Realtime delivery + richer approval payload.

-- ---------------------------------------------------------------------------
-- 1) Notification types: pending request + declined
-- ---------------------------------------------------------------------------
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (
    type in (
      'new_message',
      'new_offer',
      'offer_created',
      'offer_updated',
      'counter_offer',
      'offer_accepted',
      'message',
      'rental_confirmed',
      'rental_request',
      'rental_declined'
    )
  );

-- ---------------------------------------------------------------------------
-- 2) Owner: new pending listing rental request
-- ---------------------------------------------------------------------------
create or replace function public.notify_owner_on_listing_rental_request_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
  listing_title text;
begin
  if new.status is distinct from 'pending' then
    return new;
  end if;

  recipient := coalesce(
    new.owner_user_id,
    (select l.user_id from public.listings l where l.id = new.listing_id limit 1)
  );

  if recipient is null or recipient = new.renter_user_id then
    return new;
  end if;

  select l.title into listing_title from public.listings l where l.id = new.listing_id limit 1;
  listing_title := coalesce(nullif(trim(listing_title), ''), 'Your listing');

  -- Omit legacy `message` column: some databases only have title/body/data (e.g. streamlined schemas).
  insert into public.notifications (user_id, type, title, body, read, data)
  values (
    recipient,
    'rental_request',
    'New rental request',
    listing_title || ': someone wants to rent your gear.',
    false,
    jsonb_build_object(
      'rentalRequestId', new.id::text,
      'listingId', new.listing_id::text,
      'renterUserId', new.renter_user_id::text
    )
  );

  return new;
end;
$$;

drop trigger if exists rental_requests_notify_owner_pending_ins on public.rental_requests;
create trigger rental_requests_notify_owner_pending_ins
  after insert on public.rental_requests
  for each row
  when (new.status = 'pending')
  execute function public.notify_owner_on_listing_rental_request_pending();

-- ---------------------------------------------------------------------------
-- 3) Renter: request declined
-- ---------------------------------------------------------------------------
create or replace function public.notify_renter_on_listing_rental_request_declined()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  listing_title text;
begin
  if new.status is distinct from 'declined' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from 'declined' then
    return new;
  end if;
  if old.status is distinct from 'pending' then
    return new;
  end if;

  select l.title into listing_title from public.listings l where l.id = new.listing_id limit 1;
  listing_title := coalesce(nullif(trim(listing_title), ''), 'Listing');

  insert into public.notifications (user_id, type, title, body, read, data)
  values (
    new.renter_user_id,
    'rental_declined',
    'Rental request declined',
    'Your request for ' || listing_title || ' was declined.',
    false,
    jsonb_build_object(
      'rentalRequestId', new.id::text,
      'listingId', new.listing_id::text
    )
  );

  return new;
end;
$$;

drop trigger if exists rental_requests_notify_renter_declined_upd on public.rental_requests;
create trigger rental_requests_notify_renter_declined_upd
  after update of status on public.rental_requests
  for each row
  when (new.status = 'declined' and old.status is distinct from 'declined' and old.status = 'pending')
  execute function public.notify_renter_on_listing_rental_request_declined();

-- ---------------------------------------------------------------------------
-- 4) Approved: include rental_request_id + rental id (after rentals row exists)
-- ---------------------------------------------------------------------------
create or replace function public.notify_on_rental_request_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rental_row_id uuid;
begin
  if new.status is distinct from 'approved' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from 'approved' then
    return new;
  end if;

  select r.id into rental_row_id
  from public.rentals r
  where r.rental_request_id = new.id
  limit 1;

  insert into public.notifications (user_id, type, title, body, read, data)
  values (
    new.renter_user_id,
    'rental_confirmed',
    'Rental approved',
    'Your rental request was accepted.',
    false,
    jsonb_build_object(
      'listingId', new.listing_id::text,
      'rentalRequestId', new.id::text,
      'rentalId', rental_row_id::text
    )
  );

  if new.owner_user_id is not null and new.owner_user_id is distinct from new.renter_user_id then
    insert into public.notifications (user_id, type, title, body, read, data)
    values (
      new.owner_user_id,
      'rental_confirmed',
      'Rental confirmed',
      'A rental was approved on your listing.',
      false,
      jsonb_build_object(
        'listingId', new.listing_id::text,
        'rentalRequestId', new.id::text,
        'rentalId', rental_row_id::text
      )
    );
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Realtime: notifications + rental_requests (client badges / subscriptions)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
    ) then
      alter publication supabase_realtime add table public.notifications;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rental_requests'
    ) then
      alter publication supabase_realtime add table public.rental_requests;
    end if;
  end if;
end
$$;
