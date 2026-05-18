-- Refine cancellation_status: none | requested | declined | cancelled (terminal).
-- Distinct notification types for request / accept / decline.

update public.rentals
set cancellation_status = 'cancelled'
where cancellation_status in ('accepted', 'completed');

alter table public.rentals
  drop constraint if exists rentals_cancellation_status_check;

alter table public.rentals
  add constraint rentals_cancellation_status_check
  check (cancellation_status in ('none', 'requested', 'declined', 'cancelled'));

comment on column public.rentals.cancellation_status is
  'Cancellation workflow: none | requested | declined | cancelled (terminal; rentals.status = cancelled).';

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
      'rental_cancellation_requested',
      'rental_cancellation_accepted',
      'rental_cancellation_declined',
      'accepted',
      'started',
      'completed',
      'declined',
      'review',
      'agreement_pending',
      'offer'
    )
  );
