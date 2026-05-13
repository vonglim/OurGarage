-- Repair listing rental notification triggers: INSERT without legacy `message` column.
-- Applies after 058 if the DB never had `notifications.message` (or 058 was applied with message in INSERT).

-- ---------------------------------------------------------------------------
-- Owner: new pending listing rental request
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

-- ---------------------------------------------------------------------------
-- Renter: request declined
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

-- ---------------------------------------------------------------------------
-- Approved: renter + owner notifications (rental row must exist first)
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
