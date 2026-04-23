-- title, body, and JSON data for in-app / push payloads; data holds route ids (camelCase).
alter table public.notifications
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists data jsonb not null default '{}';

alter table public.notifications alter column message drop not null;

-- Migrate legacy type and allow new_message
update public.notifications
set
  type = 'new_message',
  body = coalesce(body, message)
where
  type = 'message';

-- Replace type check to include new_message
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (
    type in (
      'new_message',
      'new_offer',
      'offer_accepted',
      'message',
      'rental_confirmed'
    )
  );
