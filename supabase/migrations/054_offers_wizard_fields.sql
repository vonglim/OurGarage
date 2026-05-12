-- Make Offer wizard: item summary, protection value, and condition (no new tables).

alter table public.offers add column if not exists tool_description text;

alter table public.offers add column if not exists replacement_value numeric(12, 2);

alter table public.offers add column if not exists item_condition text;

comment on column public.offers.tool_description is 'Short item line (e.g. brand/model) from renter offer flow.';
comment on column public.offers.replacement_value is 'Renter-declared market / replacement value for protection estimates.';
comment on column public.offers.item_condition is 'excellent | good | fair — condition at offer time.';
