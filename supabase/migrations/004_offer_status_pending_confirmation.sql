-- App clients may set `offers.status` to `pending_confirmation` when the renter accepts
-- a poster counter and the owner must still confirm the match. Column is unbounded text;
-- no schema change required; this file documents the value for operators and migrations.

comment on column public.offers.status is
  'negotiation state: pending | pending_confirmation | accepted | declined | closed';
