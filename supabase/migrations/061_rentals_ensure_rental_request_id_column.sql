-- Fix: approval trigger references `rentals.rental_request_id` (from 021). If that column was never
-- added, `UPDATE rental_requests SET status = 'approved'` fails with:
--   column r.rental_request_id does not exist
--
-- Safe to run after 060; idempotent.

alter table public.rentals
  add column if not exists rental_request_id uuid references public.rental_requests (id) on delete set null;

create unique index if not exists rentals_rental_request_id_key
  on public.rentals (rental_request_id)
  where rental_request_id is not null;
