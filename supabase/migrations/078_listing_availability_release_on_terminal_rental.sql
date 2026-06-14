-- Listing-offer rentals store booked calendar rows on source_offer_id (not source_request_id).
-- The original cleanup trigger only fired when rental_request_id was set, so cancelled /
-- completed listing-offer rentals left stale booked segments on the calendar.

create or replace function public.handle_rentals_listing_booking_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  st text;
begin
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

  if new.rental_request_id is not null then
    delete from public.listing_availability
    where availability_type = 'booked'
      and source_request_id = new.rental_request_id;
  end if;

  if new.offer_id is not null then
    delete from public.listing_availability
    where availability_type = 'booked'
      and source_offer_id = new.offer_id;
  end if;

  return new;
end;
$$;

drop trigger if exists rentals_listing_booking_cleanup_upd on public.rentals;
create trigger rentals_listing_booking_cleanup_upd
  after update of status on public.rentals
  for each row
  when (
    (new.rental_request_id is not null or new.offer_id is not null)
    and old.status is distinct from new.status
  )
  execute function public.handle_rentals_listing_booking_cleanup();

-- Repair stale booked rows already left behind by cancelled / terminal rentals.
delete from public.listing_availability la
where la.availability_type = 'booked'
  and exists (
    select 1
    from public.rentals r
    where coalesce(lower(trim(both from r.status::text)), '') in (
      'returned', 'completed', 'cancelled', 'canceled'
    )
      and (
        (r.rental_request_id is not null and la.source_request_id = r.rental_request_id)
        or (r.offer_id is not null and la.source_offer_id = r.offer_id)
      )
  );
