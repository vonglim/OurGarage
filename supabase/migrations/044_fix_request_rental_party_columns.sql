-- Request marketplace rentals were inserted with parties swapped (poster as owner, offer author as renter).
-- Correct semantics: renter_user_id = requests.user_id (borrower), owner_user_id = offers.user_id (tool provider).
-- Only update rows that match the erroneous pattern so listing-based rentals are untouched.

update public.rentals r
set
  renter_user_id = r.owner_user_id,
  owner_user_id = r.renter_user_id
from public.offers o,
     public.requests q
where r.request_id is not null
  and r.offer_id is not null
  and o.id = r.offer_id
  and q.id = r.request_id
  and r.renter_user_id = o.user_id
  and r.owner_user_id::text = trim(q.user_id::text)
  and r.renter_user_id is distinct from r.owner_user_id;

-- Re-label verification rows to match corrected rental parties (user_id stays the same).
update public.rental_verifications v
set role = case
  when v.user_id = r.owner_user_id then 'owner'
  when v.user_id = r.renter_user_id then 'renter'
  else v.role
end
from public.rentals r
where v.rental_id = r.id
  and r.request_id is not null;

update public.rental_verification_photos p
set role = case
  when p.uploaded_by = r.owner_user_id then 'owner'
  when p.uploaded_by = r.renter_user_id then 'renter'
  else p.role
end
from public.rentals r
where p.rental_id = r.id
  and r.request_id is not null;

update public.rental_notes n
set author_role = case
  when n.author_id = r.owner_user_id then 'owner'
  when n.author_id = r.renter_user_id then 'renter'
  else n.author_role
end
from public.rentals r
where n.rental_id = r.id
  and r.request_id is not null;
