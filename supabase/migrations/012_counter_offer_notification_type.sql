-- Allow per-user `counter_offer` push/in-app server rows
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (
    type in (
      'new_message',
      'new_offer',
      'counter_offer',
      'offer_accepted',
      'message',
      'rental_confirmed'
    )
  );
