-- Link offer_messages to rentals for chat routes keyed by rental id.
alter table public.offer_messages
  add column if not exists rental_id uuid references public.rentals (id) on delete set null;

create index if not exists offer_messages_rental_id_idx on public.offer_messages (rental_id);

update public.offer_messages om
set rental_id = r.id
from public.rentals r
where r.offer_id = om.offer_id
  and om.rental_id is null;
