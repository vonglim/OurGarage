-- Explicit pickup evidence categories (owner uploads). Replaces order-based bucketing.
--
-- Apply in Supabase (CLI: supabase db push / migration run, or SQL editor). If the app errors with
-- "pickup_photo_category" / "schema cache", run this migration then reload the API schema cache in Dashboard.

alter table public.rental_verification_photos
  add column if not exists pickup_photo_category text;

alter table public.rental_verification_photos
  drop constraint if exists rental_verification_photos_pickup_photo_category_check;

alter table public.rental_verification_photos
  add constraint rental_verification_photos_pickup_photo_category_check
  check (
    pickup_photo_category is null
    or pickup_photo_category in ('item', 'serial', 'timestamp_proof', 'additional')
  );

comment on column public.rental_verification_photos.pickup_photo_category is
  'Owner pickup evidence: item, serial, timestamp_proof, additional. Null for return phase, renter rows, or legacy.';

-- Backfill legacy owner pickup rows (order-based, same as pre-045 app logic).
with ordered as (
  select
    id,
    row_number() over (partition by rental_id order by created_at asc) as rn
  from public.rental_verification_photos
  where phase = 'pickup'
    and role = 'owner'
    and pickup_photo_category is null
)
update public.rental_verification_photos p
set pickup_photo_category = case
  when o.rn <= 4 then 'item'
  when o.rn = 5 then 'serial'
  else 'additional'
end
from ordered o
where p.id = o.id;

create index if not exists rental_verification_photos_pickup_category_idx
  on public.rental_verification_photos (rental_id, phase, pickup_photo_category)
  where pickup_photo_category is not null;
