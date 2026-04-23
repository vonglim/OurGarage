-- So PostgREST can embed: select offers with profiles(name) on user_id
do $body$
begin
  if to_regclass('public.offers') is null or to_regclass('public.profiles') is null then
    return;
  end if;
  if exists (select 1 from pg_constraint where conname = 'offers_user_id_profiles_fkey') then
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
    alter table public.offers
      add constraint offers_user_id_profiles_fkey
      foreign key (user_id) references public.profiles (id) on update cascade on delete cascade;
  else
    raise notice 'offers.user_id is not uuid; add FK manually to enable profiles() embed in API';
  end if;
end
$body$;
