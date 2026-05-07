-- Fix RLS for rental_verifications bootstrap upserts.
-- Existing UI inserts owner + renter rows together during phase setup.

alter table public.rental_verifications enable row level security;

drop policy if exists "rental_verifications_insert_own" on public.rental_verifications;
drop policy if exists "rental_verifications_update_own" on public.rental_verifications;

-- Allow a rental participant to bootstrap verification rows for either party on that rental.
create policy "rental_verifications_insert_participant"
  on public.rental_verifications
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.rentals r
      where r.id = rental_verifications.rental_id
        and auth.uid() in (r.owner_user_id, r.renter_user_id)
        and rental_verifications.user_id in (r.owner_user_id, r.renter_user_id)
    )
  );

-- Updates remain self-only for the caller's own row.
create policy "rental_verifications_update_own"
  on public.rental_verifications
  for update
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.rentals r
      where r.id = rental_verifications.rental_id
        and auth.uid() in (r.owner_user_id, r.renter_user_id)
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.rentals r
      where r.id = rental_verifications.rental_id
        and auth.uid() in (r.owner_user_id, r.renter_user_id)
    )
  );
