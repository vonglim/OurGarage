-- When the listing host accepts a listing-linked offer (`offers.listing_id` set, `request_id` null),
-- create the unified `rentals` row, ensure `profiles` for FKs, notify renter + host, and mark the offer accepted.
-- Previously the app only set `pending_confirmation` with no `rentals` row — Activity / notifications never updated.

create or replace function public.accept_listing_offer_create_rental(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer record;
  v_listing_id uuid;
  v_owner uuid;
  v_renter uuid;
  v_rental_id uuid;
  v_price numeric;
  v_status text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Not authenticated');
  end if;

  select o.id, o.user_id, o.listing_id, o.status, o.current_price, o.price
    into v_offer
  from public.offers o
  where o.id = p_offer_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Offer not found');
  end if;

  if v_offer.listing_id is null then
    return jsonb_build_object('ok', false, 'error', 'Not a listing offer');
  end if;

  v_listing_id := v_offer.listing_id;

  select l.user_id into v_owner from public.listings l where l.id = v_listing_id limit 1;
  if v_owner is null then
    return jsonb_build_object('ok', false, 'error', 'Listing not found');
  end if;

  if v_owner <> auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'Only the listing host can accept');
  end if;

  v_status := coalesce(nullif(trim(v_offer.status::text), ''), 'pending');

  if v_status = 'accepted' then
    select r.id into v_rental_id from public.rentals r where r.offer_id = p_offer_id limit 1;
    return jsonb_build_object(
      'ok', true,
      'rental_id', coalesce(v_rental_id::text, ''),
      'already', true
    );
  end if;

  if v_status not in ('pending', 'pending_confirmation') then
    return jsonb_build_object('ok', false, 'error', 'Offer is not in a state that can be accepted');
  end if;

  v_renter := v_offer.user_id;
  if v_renter is null then
    return jsonb_build_object('ok', false, 'error', 'Missing renter on offer');
  end if;

  v_price := coalesce(v_offer.current_price, v_offer.price, 0);
  if v_price is null or v_price < 0 then
    v_price := 0;
  end if;

  insert into public.profiles (id, name)
  values (v_renter, 'New User')
  on conflict (id) do nothing;

  insert into public.profiles (id, name)
  values (v_owner, 'New User')
  on conflict (id) do nothing;

  select r.id into v_rental_id from public.rentals r where r.offer_id = p_offer_id limit 1;

  if v_rental_id is null then
    insert into public.rentals (
      renter_user_id,
      owner_user_id,
      listing_id,
      offer_id,
      request_id,
      rental_request_id,
      price,
      status,
      duration_type
    ) values (
      v_renter,
      v_owner,
      v_listing_id,
      p_offer_id,
      null,
      null,
      v_price,
      'active',
      'full'
    )
    returning id into v_rental_id;
  end if;

  update public.offers
  set
    status = 'accepted',
    last_updated_by = auth.uid()::text,
    updated_at = now()
  where id = p_offer_id;

  if not exists (
    select 1
    from public.notifications n
    where n.user_id = v_renter
      and n.type = 'rental_confirmed'
      and coalesce(n.data->>'rentalId', '') = v_rental_id::text
  ) then
    insert into public.notifications (user_id, type, title, body, read, data, request_id, offer_id)
    values (
      v_renter,
      'rental_confirmed',
      'Rental confirmed',
      'Your listing offer was accepted. Open the rental to coordinate pickup.',
      false,
      jsonb_build_object(
        'rentalId', v_rental_id::text,
        'listingId', v_listing_id::text,
        'offerId', p_offer_id::text
      ),
      null,
      p_offer_id
    );
  end if;

  if v_owner is distinct from v_renter
     and not exists (
       select 1
       from public.notifications n
       where n.user_id = v_owner
         and n.type = 'rental_confirmed'
         and coalesce(n.data->>'rentalId', '') = v_rental_id::text
     )
  then
    insert into public.notifications (user_id, type, title, body, read, data, request_id, offer_id)
    values (
      v_owner,
      'rental_confirmed',
      'Rental confirmed',
      'You accepted a listing offer. Open the rental workspace to coordinate.',
      false,
      jsonb_build_object(
        'rentalId', v_rental_id::text,
        'listingId', v_listing_id::text,
        'offerId', p_offer_id::text
      ),
      null,
      p_offer_id
    );
  end if;

  return jsonb_build_object('ok', true, 'rental_id', v_rental_id::text);
end;
$$;

comment on function public.accept_listing_offer_create_rental(uuid) is
  'Host accepts a listing-linked offer: profiles + rentals + rental_confirmed notifications; idempotent if already accepted.';

revoke all on function public.accept_listing_offer_create_rental(uuid) from public;
grant execute on function public.accept_listing_offer_create_rental(uuid) to authenticated;
