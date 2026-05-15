-- Keep marketplace listings visible while rented; block the reserved window on the listing calendar
-- (listing_availability.booked) instead of mutating listing_status or removing rows.
--
-- 1) On rental_request → approved: insert booked [requested_start_date, requested_end_date] when dates exist.
-- 2) On rentals.status → terminal (returned / completed / cancelled): remove that booked segment
--    so future availability checks stay accurate.

create or replace function public.handle_rentals_listing_booking_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  st text;
begin
  if new.rental_request_id is null then
    return new;
  end if;
  if tg_op <> 'UPDATE' then
    return new;
  end if;
  if old.status is not distinct from new.status then
    return new;
  end if;
  st := coalesce(lower(trim(both from new.status::text)), '');
  if st not in ('returned', 'completed', 'cancelled', 'canceled') then
    return new;
  end if;
  delete from public.listing_availability
  where availability_type = 'booked'
    and source_request_id = new.rental_request_id;
  return new;
end;
$$;

drop trigger if exists rentals_listing_booking_cleanup_upd on public.rentals;
create trigger rentals_listing_booking_cleanup_upd
  after update of status on public.rentals
  for each row
  when (
    new.rental_request_id is not null
    and old.status is distinct from new.status
  )
  execute function public.handle_rentals_listing_booking_cleanup();

create or replace function public.handle_listing_rental_request_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  equip_owner uuid;
  rental_row_id uuid;
  notify_owner_id uuid;
begin
  if new.status is distinct from 'approved' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from 'approved' then
    return new;
  end if;

  insert into public.profiles (id, name)
  values (new.renter_user_id, 'New User')
  on conflict (id) do nothing;

  select coalesce(new.owner_user_id, l.user_id) into equip_owner
  from public.listings l
  where l.id = new.listing_id
  limit 1;

  if equip_owner is null then
    raise warning 'listing_rental_approve: missing listing owner for listing_id %', new.listing_id;
    return new;
  end if;

  insert into public.profiles (id, name)
  values (equip_owner, 'New User')
  on conflict (id) do nothing;

  if not exists (select 1 from public.rentals r where r.rental_request_id = new.id) then
    insert into public.rentals (
      renter_user_id,
      owner_user_id,
      price,
      status,
      listing_id,
      rental_request_id,
      request_id,
      offer_id,
      duration_type
    ) values (
      new.renter_user_id,
      equip_owner,
      new.price,
      'active',
      new.listing_id,
      new.id,
      null,
      null,
      coalesce(nullif(trim(new.duration_type), ''), 'full')
    );
  end if;

  select r.id into rental_row_id
  from public.rentals r
  where r.rental_request_id = new.id
  limit 1;

  -- Calendar: mirror approved rental window as booked (idempotent per request + listing).
  if
    new.listing_id is not null
    and new.requested_start_date is not null
    and new.requested_end_date is not null
    and new.requested_start_date <= new.requested_end_date
  then
    if not exists (
      select 1
      from public.listing_availability la
      where la.listing_id = new.listing_id
        and la.source_request_id = new.id
        and la.availability_type = 'booked'
    ) then
      insert into public.listing_availability (
        listing_id,
        start_date,
        end_date,
        availability_type,
        source_offer_id,
        source_request_id,
        created_by_user_id
      ) values (
        new.listing_id,
        new.requested_start_date,
        new.requested_end_date,
        'booked',
        null,
        new.id,
        equip_owner
      );
    end if;
  end if;

  notify_owner_id := coalesce(new.owner_user_id, equip_owner);

  if not exists (
    select 1
    from public.notifications n
    where n.user_id = new.renter_user_id
      and n.type = 'rental_confirmed'
      and coalesce(n.data->>'rentalRequestId', '') = new.id::text
  ) then
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
  end if;

  if
    notify_owner_id is not null
    and notify_owner_id is distinct from new.renter_user_id
    and not exists (
      select 1
      from public.notifications n
      where n.user_id = notify_owner_id
        and n.type = 'rental_confirmed'
        and coalesce(n.data->>'rentalRequestId', '') = new.id::text
    )
  then
    insert into public.notifications (user_id, type, title, body, read, data)
    values (
      notify_owner_id,
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
