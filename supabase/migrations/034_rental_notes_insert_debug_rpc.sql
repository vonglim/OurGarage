-- Dev diagnostics for rental_notes RLS insert eligibility.
-- Safe to keep in non-dev environments; callable by authenticated users only.

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
    (
      auth.uid() = p_author_id
      and (
        (r.owner_user_id = auth.uid() and p_author_role = 'owner')
        or
        (r.renter_user_id = auth.uid() and p_author_role = 'renter')
      )
      and public.rental_note_matches_status(r.status, p_author_role, p_phase)
    ) as final_insert_eligible
  from public.rentals r
  where r.id = p_rental_id;
$$;

grant execute on function public.debug_rental_note_insert_eligibility(uuid, uuid, text, text) to authenticated;
