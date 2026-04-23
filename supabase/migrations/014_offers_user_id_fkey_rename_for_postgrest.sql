-- PostgREST / Supabase embed: profiles!offers_user_id_fkey (id, name) on offers.user_id → profiles.id
do $body$
begin
  if to_regclass('public.offers') is null or to_regclass('public.profiles') is null then
    return;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'offers_user_id_fkey'
      and conrelid = 'public.offers'::regclass
  ) then
    return;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'offers_user_id_profiles_fkey'
      and conrelid = 'public.offers'::regclass
  ) then
    execute 'alter table public.offers rename constraint offers_user_id_profiles_fkey to offers_user_id_fkey';
    return;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'offers'
      and column_name = 'user_id'
      and udt_name = 'uuid'
  ) then
    execute $sql$
      alter table public.offers
        add constraint offers_user_id_fkey
        foreign key (user_id) references public.profiles (id) on update cascade on delete cascade
    $sql$;
  else
    raise notice 'offers.user_id is not uuid; add offers_user_id_fkey manually for profiles embed';
  end if;
end
$body$;
