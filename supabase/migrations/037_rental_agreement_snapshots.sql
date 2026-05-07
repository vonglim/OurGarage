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

create index if not exists rental_agreement_snapshots_rental_created_idx
  on public.rental_agreement_snapshots (rental_id, created_at desc);

alter table public.rental_agreement_snapshots enable row level security;

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
