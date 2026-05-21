-- Separate physical possession confirmation from legal rental activation.

alter table public.rentals
  add column if not exists physical_possession_confirmed_at timestamptz null,
  add column if not exists rental_activated_at timestamptz null,
  add column if not exists agreement_acknowledged_at timestamptz null;

comment on column public.rentals.physical_possession_confirmed_at is
  'Bilateral in-person pickup inspection complete (receipt, checklist, evidence) — not legal activation.';
comment on column public.rentals.rental_activated_at is
  'Legal rental activation: agreement acknowledged, preauthorization succeeded, signatures complete.';
comment on column public.rentals.agreement_acknowledged_at is
  'Renter acknowledged liability / rental agreement before authorization hold.';
