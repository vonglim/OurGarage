-- Financial protection columns for listings, rentals, snapshots.
-- If a remote project skipped this migration, apply `048_rentals_financial_columns_align.sql`
-- (rentals repair) and ensure listings columns exist via the listings portion below or re-run 038.

alter table if exists public.listings
  add column if not exists replacement_value numeric(10,2) null,
  add column if not exists daily_late_fee numeric(10,2) not null default 0,
  add column if not exists max_late_fee_cap numeric(10,2) not null default 0;

alter table if exists public.rentals
  add column if not exists replacement_value numeric(10,2) null,
  add column if not exists daily_late_fee numeric(10,2) null,
  add column if not exists max_late_fee_cap numeric(10,2) null,
  add column if not exists preauth_amount numeric(10,2) null,
  add column if not exists preauth_status text null,
  add column if not exists preauth_authorized_at timestamptz null;

update public.listings
set max_late_fee_cap = daily_late_fee
where max_late_fee_cap < daily_late_fee;

alter table if exists public.rental_agreement_snapshots
  add column if not exists replacement_value numeric(10,2) null,
  add column if not exists daily_late_fee numeric(10,2) null,
  add column if not exists max_late_fee_cap numeric(10,2) null,
  add column if not exists preauth_amount numeric(10,2) null,
  add column if not exists verification_photo_refs_json jsonb not null default '[]'::jsonb;
