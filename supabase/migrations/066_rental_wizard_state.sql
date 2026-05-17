-- Renter guided wizard: seen transitions + lightweight progress (not source of truth for rental lifecycle).

create table if not exists public.rental_wizard_state (
  rental_id uuid not null references public.rentals (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_seen_step text null,
  seen_transition_keys jsonb not null default '[]'::jsonb,
  wizard_progress jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (rental_id, user_id)
);

create index if not exists rental_wizard_state_user_idx
  on public.rental_wizard_state (user_id, updated_at desc);

comment on table public.rental_wizard_state is
  'Per-user wizard UX state: seen emotional transitions and lightweight flags. Rental lifecycle remains authoritative on rentals + verifications.';

alter table public.rental_wizard_state enable row level security;

drop policy if exists "rental_wizard_state_select_party" on public.rental_wizard_state;
create policy "rental_wizard_state_select_party" on public.rental_wizard_state
  for select to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.rentals r
      where r.id = rental_id
        and (r.owner_user_id = auth.uid() or r.renter_user_id = auth.uid())
    )
  );

drop policy if exists "rental_wizard_state_upsert_self" on public.rental_wizard_state;
create policy "rental_wizard_state_upsert_self" on public.rental_wizard_state
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.rentals r
      where r.id = rental_id
        and (r.owner_user_id = auth.uid() or r.renter_user_id = auth.uid())
    )
  );
