-- Structured offer-stage verification photos (categories align with rental pickup_photo_category).
alter table public.offers add column if not exists offer_evidence jsonb;

comment on column public.offers.offer_evidence is
  'JSON: { "v": 1, "photos": [ { "url": "https://...", "category": "item"|"serial"|"timestamp_proof"|"additional" } ] }. Flat offer_images kept for backward compatibility.';
