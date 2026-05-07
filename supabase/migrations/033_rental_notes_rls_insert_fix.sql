-- Hotfix: rental_notes INSERT policy was too strict for existing rental.status values.
-- Keeps security constraints but allows owner notes before handoff and renter notes only during active window.

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
      and coalesce(p_status, 'pending') not in ('handed_off', 'active', 'return_pending', 'returned', 'completed', 'cancelled')
    when p_author_role = 'renter' then
      p_phase = 'active_rental'
      and coalesce(p_status, 'pending') in ('handed_off', 'active', 'return_pending')
    else false
  end;
$$;

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
