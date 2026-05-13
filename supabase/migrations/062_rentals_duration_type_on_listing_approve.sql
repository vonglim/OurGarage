-- `public.rentals.duration_type` is NOT NULL on some deployments; listing approval must set it from
-- `rental_requests.duration_type` (half | full | week | multi_day).
--
-- 1) Ensure column + default for any code path that omits the column.
-- 2) Replace approval handler so INSERT always copies `new.duration_type`.

alter table public.rentals add column if not exists duration_type text;

update public.rentals
set duration_type = 'full'
where duration_type is null;

alter table public.rentals alter column duration_type set default 'full';

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
