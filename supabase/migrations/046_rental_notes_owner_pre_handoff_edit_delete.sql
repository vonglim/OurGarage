-- Allow owners to edit/delete their own pre-handoff pickup instructions until handoff
-- (replaces the 10-minute edit window, which blocked long-lived instruction edits).

drop policy if exists "rental_notes_update_recent_unlocked_own" on public.rental_notes;

create policy "rental_notes_update_owner_pre_handoff_own"
  on public.rental_notes
  for update
  to authenticated
  using (
    author_id = auth.uid()
    and author_role = 'owner'
    and phase = 'pre_handoff'
    and exists (
      select 1
      from public.rentals r
      where r.id = rental_notes.rental_id
        and r.owner_user_id = auth.uid()
        and public.rental_note_matches_status(r.status, 'owner', 'pre_handoff')
    )
  )
  with check (
    author_id = auth.uid()
    and author_role = 'owner'
    and phase = 'pre_handoff'
    and char_length(trim(note)) > 0
    and exists (
      select 1
      from public.rentals r
      where r.id = rental_notes.rental_id
        and r.owner_user_id = auth.uid()
        and public.rental_note_matches_status(r.status, 'owner', 'pre_handoff')
    )
  );

drop policy if exists "rental_notes_delete_owner_pre_handoff_own" on public.rental_notes;

create policy "rental_notes_delete_owner_pre_handoff_own"
  on public.rental_notes
  for delete
  to authenticated
  using (
    author_id = auth.uid()
    and author_role = 'owner'
    and phase = 'pre_handoff'
    and exists (
      select 1
      from public.rentals r
      where r.id = rental_notes.rental_id
        and r.owner_user_id = auth.uid()
        and public.rental_note_matches_status(r.status, 'owner', 'pre_handoff')
    )
  );
