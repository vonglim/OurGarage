-- Rental verification evidence: per-party checklist, shared notes sync, confirmations, photos metadata.
-- Storage bucket: rental-evidence (paths: {rental_id}/pickup|return/{user_id}/...)

create table if not exists public.rental_verifications (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rentals (id) on delete cascade,
  phase text not null check (phase in ('pickup', 'return')),
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'renter')),
  checklist_state jsonb not null default '{}'::jsonb,
  notes text not null default '',
  confirmed boolean not null default false,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rental_id, phase, user_id)
);

create index if not exists rental_verifications_rental_phase_idx
  on public.rental_verifications (rental_id, phase);

create table if not exists public.rental_verification_photos (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rentals (id) on delete cascade,
  phase text not null check (phase in ('pickup', 'return')),
  uploaded_by uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'renter')),
  storage_path text not null,
  public_url text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists rental_verification_photos_rental_phase_idx
  on public.rental_verification_photos (rental_id, phase);

create or replace function public.set_rental_verifications_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rental_verifications_updated_at on public.rental_verifications;
create trigger rental_verifications_updated_at
  before update on public.rental_verifications
  for each row execute function public.set_rental_verifications_updated_at();

-- Sync shared notes to all rows for (rental_id, phase). Caller must be owner or renter on the rental.
create or replace function public.sync_rental_verification_notes(
  p_rental_id uuid,
  p_phase text,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_phase is null or p_phase not in ('pickup', 'return') then
    raise exception 'invalid phase';
  end if;
  if not exists (
    select 1 from public.rentals r
    where r.id = p_rental_id
      and (r.owner_user_id = auth.uid() or r.renter_user_id = auth.uid())
  ) then
    raise exception 'not authorized';
  end if;

  update public.rental_verifications
  set notes = coalesce(p_notes, ''),
      updated_at = now()
  where rental_id = p_rental_id
    and phase = p_phase;
end;
$$;

grant execute on function public.sync_rental_verification_notes(uuid, text, text) to authenticated;

alter table public.rental_verifications enable row level security;
alter table public.rental_verification_photos enable row level security;

create policy "rental_verifications_select_party"
  on public.rental_verifications for select
  using (
    exists (
      select 1 from public.rentals r
      where r.id = rental_verifications.rental_id
        and (r.owner_user_id = auth.uid() or r.renter_user_id = auth.uid())
    )
  );

create policy "rental_verifications_insert_own"
  on public.rental_verifications for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.rentals r
      where r.id = rental_id
        and (r.owner_user_id = auth.uid() or r.renter_user_id = auth.uid())
    )
  );

create policy "rental_verifications_update_own"
  on public.rental_verifications for update
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.rentals r
      where r.id = rental_verifications.rental_id
        and (r.owner_user_id = auth.uid() or r.renter_user_id = auth.uid())
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.rentals r
      where r.id = rental_verifications.rental_id
        and (r.owner_user_id = auth.uid() or r.renter_user_id = auth.uid())
    )
  );

create policy "rental_verification_photos_select_party"
  on public.rental_verification_photos for select
  using (
    exists (
      select 1 from public.rentals r
      where r.id = rental_verification_photos.rental_id
        and (r.owner_user_id = auth.uid() or r.renter_user_id = auth.uid())
    )
  );

create policy "rental_verification_photos_insert_own"
  on public.rental_verification_photos for insert
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.rentals r
      where r.id = rental_id
        and (r.owner_user_id = auth.uid() or r.renter_user_id = auth.uid())
    )
  );

create policy "rental_verification_photos_delete_own"
  on public.rental_verification_photos for delete
  using (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.rentals r
      where r.id = rental_verification_photos.rental_id
        and (r.owner_user_id = auth.uid() or r.renter_user_id = auth.uid())
    )
  );

insert into storage.buckets (id, name, public)
values ('rental-evidence', 'rental-evidence', false)
on conflict (id) do update set public = excluded.public;

-- Storage RLS: rental parties can read/write objects under their rental_id prefix.
drop policy if exists "rental_evidence_select_party" on storage.objects;
drop policy if exists "rental_evidence_insert_party" on storage.objects;
drop policy if exists "rental_evidence_update_party" on storage.objects;
drop policy if exists "rental_evidence_delete_party" on storage.objects;

create policy "rental_evidence_select_party"
  on storage.objects for select
  using (
    bucket_id = 'rental-evidence'
    and exists (
      select 1 from public.rentals r
      where (storage.foldername(name))[1] = r.id::text
        and (r.owner_user_id = auth.uid() or r.renter_user_id = auth.uid())
    )
  );

create policy "rental_evidence_insert_party"
  on storage.objects for insert
  with check (
    bucket_id = 'rental-evidence'
    and auth.role() = 'authenticated'
    and exists (
      select 1 from public.rentals r
      where (storage.foldername(name))[1] = r.id::text
        and (r.owner_user_id = auth.uid() or r.renter_user_id = auth.uid())
    )
  );

create policy "rental_evidence_update_party"
  on storage.objects for update
  using (
    bucket_id = 'rental-evidence'
    and exists (
      select 1 from public.rentals r
      where (storage.foldername(name))[1] = r.id::text
        and (r.owner_user_id = auth.uid() or r.renter_user_id = auth.uid())
    )
  );

create policy "rental_evidence_delete_party"
  on storage.objects for delete
  using (
    bucket_id = 'rental-evidence'
    and exists (
      select 1 from public.rentals r
      where (storage.foldername(name))[1] = r.id::text
        and (r.owner_user_id = auth.uid() or r.renter_user_id = auth.uid())
    )
  );
