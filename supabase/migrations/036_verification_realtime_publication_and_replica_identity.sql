-- Ensure rental verification tables are fully wired for cross-device Realtime delivery.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rental_verifications'
  ) then
    alter publication supabase_realtime add table public.rental_verifications;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rental_verification_photos'
  ) then
    alter publication supabase_realtime add table public.rental_verification_photos;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rentals'
  ) then
    alter publication supabase_realtime add table public.rentals;
  end if;
end
$$;

alter table public.rental_verifications replica identity full;
alter table public.rental_verification_photos replica identity full;
alter table public.rentals replica identity full;
