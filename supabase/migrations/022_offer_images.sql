-- Image URLs attached to offers (e.g. from make-offer). Optional; null = none.
alter table public.offers add column if not exists offer_images text[];

-- Denormalized copy on negotiation / chat rows so threads can render attachments per message.
alter table public.offer_messages add column if not exists offer_images text[];
