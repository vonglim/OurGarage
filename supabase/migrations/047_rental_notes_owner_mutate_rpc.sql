-- Reliable owner pre-handoff note update/delete via SECURITY DEFINER RPCs.
-- Direct DELETE/UPDATE under RLS can return 0 rows in some client/PostgREST setups; RPCs enforce the same rules explicitly.

create or replace function public.delete_owner_pre_handoff_rental_note(p_note_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.rental_notes%rowtype;
  v_status text;
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

  select r.status into v_status from public.rentals r where r.id = v_row.rental_id;
  if not found then
    return false;
  end if;

  if not public.rental_note_matches_status(v_status, 'owner', 'pre_handoff') then
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
  v_status text;
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

  select r.status into v_status from public.rentals r where r.id = v_row.rental_id;
  if not found then
    return false;
  end if;

  if not public.rental_note_matches_status(v_status, 'owner', 'pre_handoff') then
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

revoke all on function public.delete_owner_pre_handoff_rental_note(uuid) from public;
revoke all on function public.update_owner_pre_handoff_rental_note(uuid, text) from public;

grant execute on function public.delete_owner_pre_handoff_rental_note(uuid) to authenticated;
grant execute on function public.update_owner_pre_handoff_rental_note(uuid, text) to authenticated;
