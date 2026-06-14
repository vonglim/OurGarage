-- Repair: migration 076 referenced profiles.display_name; schema uses profiles.name.
-- Without this fix, rental_requests INSERT fails in notify_owner_on_listing_rental_request_pending.

create or replace function public.notify_owner_on_listing_rental_request_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
  listing_title text;
  renter_name text;
  date_line text;
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

  insert into public.profiles (id, name)
  values (recipient, 'New User')
  on conflict (id) do nothing;

  insert into public.profiles (id, name)
  values (new.renter_user_id, 'New User')
  on conflict (id) do nothing;

  select l.title into listing_title from public.listings l where l.id = new.listing_id limit 1;
  listing_title := coalesce(nullif(trim(listing_title), ''), 'Your listing');

  select coalesce(nullif(trim(p.name), ''), 'A renter')
  into renter_name
  from public.profiles p
  where p.id = new.renter_user_id;

  if new.requested_start_date is not null and new.requested_end_date is not null then
    date_line := to_char(new.requested_start_date, 'Mon DD, YYYY')
      || ' – '
      || to_char(new.requested_end_date, 'Mon DD, YYYY');
  elsif new.requested_start_date is not null then
    date_line := to_char(new.requested_start_date, 'Mon DD, YYYY');
  else
    date_line := initcap(replace(coalesce(new.duration_type, 'rental'), '_', ' '));
  end if;

  insert into public.notifications (user_id, type, title, body, read, data)
  values (
    recipient,
    'rental_request',
    renter_name || ' requested ' || listing_title,
    date_line || E'\nReview and approve or decline this request.',
    false,
    jsonb_build_object(
      'rentalRequestId', new.id::text,
      'listingId', new.listing_id::text,
      'renterUserId', new.renter_user_id::text,
      'requestedStartDate', new.requested_start_date::text,
      'requestedEndDate', new.requested_end_date::text,
      'durationType', new.duration_type
    )
  );

  return new;
end;
$$;
