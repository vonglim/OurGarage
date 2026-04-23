-- Per-user in-app / cross-device notification rows (drives Supabase list + RLS in client).
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type text not null
    check (
      type in (
        'message',
        'new_offer',
        'offer_accepted',
        'rental_confirmed'
      )
    ),
  message text not null,
  read boolean not null default false,
  request_id uuid references public.requests (id) on delete set null,
  offer_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_created_at_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_id_read_idx
  on public.notifications (user_id, read);

alter table public.notifications enable row level security;

create policy "Users read their notifications" on public.notifications
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Inserts are performed from the app when an actor triggers an event (receiver is a different user).
create policy "Authenticated users can create notifications" on public.notifications
  for insert
  to authenticated
  with check (true);

create policy "Users update their own notifications" on public.notifications
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.notifications is 'Recipient = user_id; one row per fan-out.';
