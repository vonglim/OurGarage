-- Owner pre-handoff notes during pickup prep when rentals.status = 'active' (booking approved)
-- but physical pickup handoff is not complete yet.
-- Previous rental_note_matches_status blocked all `active` rows, causing RLS insert failures.

create or replace function public.rental_pickup_handoff_complete(p_rental_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.rentals r
    where r.id = p_rental_id
      and (
        r.signed_at is not null
        or coalesce(r.handoff_approved_by_renter, false) = true
        or coalesce(r.status, 'pending') in ('handed_off', 'return_pending', 'returned', 'completed')
      )
  );
$$;

comment on function public.rental_pickup_handoff_complete(uuid) is
  'True when bilateral pickup handoff is recorded (signed_at, renter handoff ack, or post-handoff status).';

create or replace function public.rental_owner_pre_handoff_notes_allowed(p_rental_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.rentals r
    where r.id = p_rental_id
      and coalesce(r.status, 'pending') not in ('returned', 'completed', 'cancelled')
      and not public.rental_pickup_handoff_complete(p_rental_id)
      and (
        coalesce(r.status, 'pending') in ('pending', 'accepted', 'meetup_scheduled')
        or coalesce(r.status, 'pending') = 'active'
      )
  );
$$;

comment on function public.rental_owner_pre_handoff_notes_allowed(uuid) is
  'Owner pickup-prep instructions allowed until handoff; includes status=active before equipment-out.';

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
      and coalesce(p_status, 'pending') not in ('handed_off', 'return_pending', 'returned', 'completed', 'cancelled')
      and coalesce(p_status, 'pending') in ('pending', 'accepted', 'meetup_scheduled', 'active')
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
        and (
          (
            rental_notes.author_role = 'owner'
            and rental_notes.phase = 'pre_handoff'
            and public.rental_owner_pre_handoff_notes_allowed(rental_notes.rental_id)
          )
          or (
            rental_notes.author_role = 'renter'
            and rental_notes.phase = 'active_rental'
            and public.rental_note_matches_status(r.status, 'renter', 'active_rental')
          )
        )
    )
  );

drop policy if exists "rental_notes_update_owner_pre_handoff_own" on public.rental_notes;
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
        and public.rental_owner_pre_handoff_notes_allowed(rental_notes.rental_id)
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
        and public.rental_owner_pre_handoff_notes_allowed(rental_notes.rental_id)
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
        and public.rental_owner_pre_handoff_notes_allowed(rental_notes.rental_id)
    )
  );

create or replace function public.insert_owner_pre_handoff_rental_note(
  p_rental_id uuid,
  p_note text
)
returns public.rental_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_trim text := trim(p_note);
  v_row public.rental_notes%rowtype;
begin
  if v_uid is null or char_length(v_trim) = 0 then
    raise exception 'invalid note';
  end if;

  if not public.rental_owner_pre_handoff_notes_allowed(p_rental_id) then
    raise exception 'owner pre-handoff notes not allowed for this rental';
  end if;

  if not exists (
    select 1 from public.rentals r
    where r.id = p_rental_id and r.owner_user_id = v_uid
  ) then
    raise exception 'not rental owner';
  end if;

  insert into public.rental_notes (rental_id, author_id, author_role, phase, note)
  values (p_rental_id, v_uid, 'owner', 'pre_handoff', v_trim)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.insert_owner_pre_handoff_rental_note(uuid, text) from public;
grant execute on function public.insert_owner_pre_handoff_rental_note(uuid, text) to authenticated;

create or replace function public.delete_owner_pre_handoff_rental_note(p_note_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.rental_notes%rowtype;
  v_deleted int;
begin
  if v_uid is null then
    return false;
  end if;

  select * into v_row from public.rental_notes where id = p_note_id;
  if not found then
    return false;
  end if;

  if v_row.author_id <> v_uid
     or v_row.author_role <> 'owner'
     or v_row.phase <> 'pre_handoff' then
    return false;
  end if;

  if not public.rental_owner_pre_handoff_notes_allowed(v_row.rental_id) then
    return false;
  end if;

  if not exists (
    select 1 from public.rentals r
    where r.id = v_row.rental_id and r.owner_user_id = v_uid
  ) then
    return false;
  end if;

  delete from public.rental_notes where id = p_note_id;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

create or replace function public.update_owner_pre_handoff_rental_note(p_note_id uuid, p_note text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.rental_notes%rowtype;
  v_trim text := trim(p_note);
  v_updated int;
begin
  if v_uid is null or char_length(v_trim) = 0 then
    return false;
  end if;

  select * into v_row from public.rental_notes where id = p_note_id;
  if not found then
    return false;
  end if;

  if v_row.author_id <> v_uid
     or v_row.author_role <> 'owner'
     or v_row.phase <> 'pre_handoff' then
    return false;
  end if;

  if not public.rental_owner_pre_handoff_notes_allowed(v_row.rental_id) then
    return false;
  end if;

  if not exists (
    select 1 from public.rentals r
    where r.id = v_row.rental_id and r.owner_user_id = v_uid
  ) then
    return false;
  end if;

  update public.rental_notes
  set note = v_trim, edited_at = now()
  where id = p_note_id;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

create or replace function public.debug_rental_note_insert_eligibility(
  p_rental_id uuid,
  p_author_id uuid,
  p_author_role text,
  p_phase text
)
returns table (
  auth_uid uuid,
  rental_id uuid,
  rental_status text,
  rental_owner_user_id uuid,
  rental_renter_user_id uuid,
  requested_author_id uuid,
  requested_author_role text,
  requested_phase text,
  auth_matches_author_id boolean,
  auth_is_owner_participant boolean,
  auth_is_renter_participant boolean,
  role_matches_owner boolean,
  role_matches_renter boolean,
  status_phase_allows_note boolean,
  pickup_handoff_complete boolean,
  owner_pre_handoff_allowed boolean,
  final_insert_eligible boolean
)
language sql
security definer
set search_path = public
as $$
  select
    auth.uid() as auth_uid,
    r.id as rental_id,
    coalesce(r.status, 'pending') as rental_status,
    r.owner_user_id as rental_owner_user_id,
    r.renter_user_id as rental_renter_user_id,
    p_author_id as requested_author_id,
    p_author_role as requested_author_role,
    p_phase as requested_phase,
    (auth.uid() = p_author_id) as auth_matches_author_id,
    (auth.uid() = r.owner_user_id) as auth_is_owner_participant,
    (auth.uid() = r.renter_user_id) as auth_is_renter_participant,
    (r.owner_user_id = auth.uid() and p_author_role = 'owner') as role_matches_owner,
    (r.renter_user_id = auth.uid() and p_author_role = 'renter') as role_matches_renter,
    public.rental_note_matches_status(r.status, p_author_role, p_phase) as status_phase_allows_note,
    public.rental_pickup_handoff_complete(r.id) as pickup_handoff_complete,
    public.rental_owner_pre_handoff_notes_allowed(r.id) as owner_pre_handoff_allowed,
    (
      auth.uid() = p_author_id
      and (
        (r.owner_user_id = auth.uid() and p_author_role = 'owner')
        or
        (r.renter_user_id = auth.uid() and p_author_role = 'renter')
      )
      and (
        (
          p_author_role = 'owner'
          and p_phase = 'pre_handoff'
          and public.rental_owner_pre_handoff_notes_allowed(r.id)
        )
        or (
          p_author_role = 'renter'
          and p_phase = 'active_rental'
          and public.rental_note_matches_status(r.status, 'renter', 'active_rental')
        )
      )
    ) as final_insert_eligible
  from public.rentals r
  where r.id = p_rental_id;
$$;
