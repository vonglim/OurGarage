-- Anti-spam / negotiation lifecycle: decline totals, withdraw cycles, re-offer cooldown, permanent lock.
alter table public.offers
  add column if not exists negotiation_decline_total int not null default 0;

alter table public.offers
  add column if not exists withdraw_cycle_count int not null default 0;

alter table public.offers
  add column if not exists last_withdrawal_at timestamptz null;

alter table public.offers
  add column if not exists negotiation_locked boolean not null default false;

comment on column public.offers.negotiation_decline_total is
  'Cumulative owner declines on this renter+request thread; at 3, negotiation_locked.';

comment on column public.offers.withdraw_cycle_count is
  'Number of completed renter withdraws; at 2, negotiation_locked (max 2 threads per pair).';

comment on column public.offers.last_withdrawal_at is
  'When the renter last withdrew; enforces re-offer cooldown.';

comment on column public.offers.negotiation_locked is
  'When true, no new offers/counters for this renter on this request.';
