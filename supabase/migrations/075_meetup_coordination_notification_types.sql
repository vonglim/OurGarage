-- Meetup coordination notification types for wizard proposal/acceptance alerts.

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
      'pickup_proposal_received',
      'return_proposal_received',
      'pickup_confirmed',
      'return_confirmed',
      'accepted',
      'started',
      'completed',
      'declined',
      'review',
      'agreement_pending',
      'offer'
    )
  );
