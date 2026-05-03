-- Listing owners must see rental_requests for their listings when owner_user_id was not denormalized (legacy rows).

drop policy if exists "rental_requests_select_parties" on public.rental_requests;
create policy "rental_requests_select_parties" on public.rental_requests
  for select
  using (
    renter_user_id = auth.uid()
    or owner_user_id = auth.uid()
    or exists (
      select 1
      from public.listings l
      where l.id = rental_requests.listing_id
        and l.user_id = auth.uid()
    )
  );

drop policy if exists "rental_requests_update_parties" on public.rental_requests;
create policy "rental_requests_update_parties" on public.rental_requests
  for update
  using (
    renter_user_id = auth.uid()
    or owner_user_id = auth.uid()
    or exists (
      select 1
      from public.listings l
      where l.id = rental_requests.listing_id
        and l.user_id = auth.uid()
    )
  );
