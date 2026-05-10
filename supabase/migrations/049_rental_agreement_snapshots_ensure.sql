-- Idempotent: full rental_agreement_snapshots shape + RLS expected by the app.
-- Use when 037/038 were never applied or a project was created from a partial migration set.
-- Notifies PostgREST to reload schema so new objects are visible to the API.

create table if not exists public.rental_agreement_snapshots (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rentals (id) on delete cascade,
  agreement_version integer not null,
  agreement_text text not null,
  rental_summary_json jsonb not null default '{}'::jsonb,
  signed_name text not null,
  signed_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.rental_agreement_snapshots
  add column if not exists replacement_value numeric(10,2) null,
  add column if not exists daily_late_fee numeric(10,2) null,
  add column if not exists max_late_fee_cap numeric(10,2) null,
  add column if not exists preauth_amount numeric(10,2) null,
  add column if not exists verification_photo_refs_json jsonb not null default '[]'::jsonb,
  add column if not exists signed_name_as_entered text null,
  add column if not exists signed_by_user_id uuid null references public.profiles (id) on delete set null;

create index if not exists rental_agreement_snapshots_rental_created_idx
  on public.rental_agreement_snapshots (rental_id, created_at desc);

alter table public.rental_agreement_snapshots enable row level security;

drop policy if exists "rental_agreement_snapshots_select_participants" on public.rental_agreement_snapshots;
drop policy if exists "rental_agreement_snapshots_insert_renter_only" on public.rental_agreement_snapshots;

create policy "rental_agreement_snapshots_select_participants"
  on public.rental_agreement_snapshots
  for select
  using (
    exists (
      select 1
      from public.rentals r
      where r.id = rental_agreement_snapshots.rental_id
        and auth.uid() in (r.owner_user_id, r.renter_user_id)
    )
  );

create policy "rental_agreement_snapshots_insert_renter_only"
  on public.rental_agreement_snapshots
  for insert
  with check (
    exists (
      select 1
      from public.rentals r
      where r.id = rental_agreement_snapshots.rental_id
        and r.renter_user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
