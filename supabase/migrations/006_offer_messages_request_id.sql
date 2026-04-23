-- So offer_messages can be listed by request (and offer) for full thread sync, without filtering by kind or author in the app.
alter table public.offer_messages add column if not exists request_id uuid references public.requests (id) on delete set null;

update public.offer_messages om
set request_id = o.request_id
from public.offers o
where o.id = om.offer_id
  and (om.request_id is null or om.request_id is distinct from o.request_id);

create index if not exists offer_messages_request_offer_created_at_idx
  on public.offer_messages (request_id, offer_id, created_at);
