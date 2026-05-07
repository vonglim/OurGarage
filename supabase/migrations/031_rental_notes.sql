-- Rental lifecycle operational notes (append-only timeline).

alter table public.rentals
  alter column status set default 'pending';

comment on column public.rentals.status is
  'Lifecycle status: pending, accepted, meetup_scheduled, handed_off, active, return_pending, returned, completed, cancelled.';

create table if not exists public.rental_notes (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rentals (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  author_role text not null check (author_role in ('owner', 'renter')),
  phase text not null check (phase in ('pre_handoff', 'active_rental')),
  note text not null check (char_length(trim(note)) > 0),
  locked boolean not null default false,
  edited_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists rental_notes_rental_id_idx
  on public.rental_notes (rental_id);

create index if not exists rental_notes_created_at_idx
  on public.rental_notes (created_at);

do $$
begin
  begin
    alter publication supabase_realtime add table public.rental_notes;
  exception
    when duplicate_object then null;
  end;
end $$;

create or replace function public.rental_note_matches_status(
  p_status text,
  p_author_role text,
  p_phase text
)
returns boolean
language sql
immutable
as $$
  select case
    when p_author_role = 'owner' then
      p_phase = 'pre_handoff'
      and coalesce(p_status, 'pending') in ('pending', 'accepted', 'meetup_scheduled')
    when p_author_role = 'renter' then
      p_phase = 'active_rental'
      and coalesce(p_status, 'pending') in ('handed_off', 'active', 'return_pending')
    else false
  end;
$$;

alter table public.rental_notes enable row level security;

drop policy if exists "rental_notes_select_participants" on public.rental_notes;
create policy "rental_notes_select_participants"
  on public.rental_notes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.rentals r
      where r.id = rental_notes.rental_id
        and auth.uid() in (r.owner_user_id, r.renter_user_id)
    )
  );

drop policy if exists "rental_notes_insert_valid_phase" on public.rental_notes;
create policy "rental_notes_insert_valid_phase"
  on public.rental_notes
  for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and exists (
      select 1
      from public.rentals r
      where r.id = rental_notes.rental_id
        and (
          (r.owner_user_id = auth.uid() and rental_notes.author_role = 'owner')
          or
          (r.renter_user_id = auth.uid() and rental_notes.author_role = 'renter')
        )
        and public.rental_note_matches_status(r.status, rental_notes.author_role, rental_notes.phase)
    )
  );

drop policy if exists "rental_notes_update_recent_unlocked_own" on public.rental_notes;
create policy "rental_notes_update_recent_unlocked_own"
  on public.rental_notes
  for update
  to authenticated
  using (
    author_id = auth.uid()
    and locked = false
    and created_at > now() - interval '10 minutes'
    and exists (
      select 1
      from public.rentals r
      where r.id = rental_notes.rental_id
        and coalesce(r.status, 'pending') not in ('returned', 'completed', 'cancelled')
    )
  )
  with check (
    author_id = auth.uid()
    and locked = false
    and created_at > now() - interval '10 minutes'
    and exists (
      select 1
      from public.rentals r
      where r.id = rental_notes.rental_id
        and coalesce(r.status, 'pending') not in ('returned', 'completed', 'cancelled')
    )
  );
