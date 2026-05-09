-- Idempotent alignment for `public.rentals` financial / protection columns.
-- Mirrors 038_financial_protection_fields.sql for deployments where 038 was never applied
-- or drifted (fixes PostgREST PGRST204 / "could not find column ... in the schema cache").

alter table if exists public.rentals
  add column if not exists replacement_value numeric(10,2) null,
  add column if not exists daily_late_fee numeric(10,2) null,
  add column if not exists max_late_fee_cap numeric(10,2) null,
  add column if not exists preauth_amount numeric(10,2) null,
  add column if not exists preauth_status text null,
  add column if not exists preauth_authorized_at timestamptz null;

comment on column public.rentals.max_late_fee_cap is
  'Upper bound for cumulative late fees for this rental (financial protection).';
