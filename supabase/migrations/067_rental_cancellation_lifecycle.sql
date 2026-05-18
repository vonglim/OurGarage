-- Rental cancellation lifecycle (request → accept/decline → completed).
-- Soft-cancel only: rentals.status = cancelled; history preserved.

alter table public.rentals
  add column if not exists cancellation_status text not null default 'none',
  add column if not exists cancellation_requested_by uuid null references auth.users (id) on delete set null,
  add column if not exists cancellation_requested_at timestamptz null,
  add column if not exists cancellation_reason text null,
  add column if not exists cancellation_resolved_at timestamptz null,
  add column if not exists cancellation_resolved_by uuid null references auth.users (id) on delete set null;

alter table public.rentals
  drop constraint if exists rentals_cancellation_status_check;

alter table public.rentals
  add constraint rentals_cancellation_status_check
  check (
    cancellation_status in ('none', 'requested', 'accepted', 'declined', 'completed')
  );

comment on column public.rentals.cancellation_status is
  'Cancellation workflow: none | requested | accepted | declined | completed (terminal with status=cancelled).';
comment on column public.rentals.cancellation_reason is
  'Machine key: change_of_plans | found_another | scheduling_conflict | item_unavailable | safety | other';

create index if not exists rentals_cancellation_status_idx
  on public.rentals (cancellation_status)
  where cancellation_status <> 'none';

-- Notification type for cancellation alerts (must include every type already in 058+ rows)
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (
    type in (
      'new_message',
      'new_offer',
      'offer_created',
      'offer_updated',
      'counter_offer',
      'offer_accepted',
      'message',
      'rental_confirmed',
      'rental_request',
      'rental_declined',
      'rental_cancellation',
      -- legacy rows (pre-unified type names)
      'accepted',
      'started',
      'completed',
      'declined',
      'review',
      'agreement_pending',
      'offer'
    )
  );
