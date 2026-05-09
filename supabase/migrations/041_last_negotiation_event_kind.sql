-- Denormalized last negotiation write for UI (e.g. Activity vs. counter).
alter table public.offers
  add column if not exists last_negotiation_event_kind text null;

comment on column public.offers.last_negotiation_event_kind is
  'Mirrors the latest offer_messages.kind from negotiation writes (initial, renter_update, poster_counter, proposal_declined, etc.).';
