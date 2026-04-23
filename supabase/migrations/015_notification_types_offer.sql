-- Server notification types: offer lifecycle + messaging (app sends recipient-only rows)
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
      'rental_confirmed'
    )
  );
