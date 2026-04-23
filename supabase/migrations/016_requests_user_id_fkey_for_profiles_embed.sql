-- PostgREST: `select=*,profiles!requests_user_id_fkey(id,name)` for request list/detail.
-- Schema note: if `user_id` references `auth.users` only, drop that FK in favor of `profiles`
-- (ids align 1:1) so the embed is unambiguous, matching `offers.user_id` → `profiles.id`.
do $body$
declare
  def text;
  oid1 oid;
begin
  if to_regclass('public.requests') is null or to_regclass('public.profiles') is null then
    return;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where
      table_schema = 'public'
      and table_name = 'requests'
      and column_name = 'user_id'
      and udt_name = 'uuid'
  ) then
    raise notice 'requests.user_id is not uuid; add requests_user_id_fkey to public.profiles manually to enable profiles() embed';
    return;
  end if;

  select c.oid
    into oid1
  from pg_constraint c
  where
    c.conname = 'requests_user_id_fkey'
    and c.conrelid = 'public.requests'::regclass
  limit 1;

  if oid1 is not null then
    def := pg_get_constraintdef(oid1);
    if def ilike '%references public.profiles%' or def ilike '%references%profiles%(%id)%' then
      return;
    end if;
    if def ilike '%references auth.users%' then
      execute 'alter table public.requests drop constraint requests_user_id_fkey';
    end if;
  end if;

  if exists (
    select 1
    from pg_constraint c
    where
      c.conname = 'requests_user_id_profiles_fkey'
      and c.conrelid = 'public.requests'::regclass
  ) then
    execute 'alter table public.requests rename constraint requests_user_id_profiles_fkey to requests_user_id_fkey';
    return;
  end if;

  if exists (
    select 1
    from pg_constraint c
    where
      c.conname = 'requests_user_id_fkey'
      and c.conrelid = 'public.requests'::regclass
  ) then
    return;
  end if;

  alter table public.requests
    add constraint requests_user_id_fkey
    foreign key (user_id) references public.profiles (id) on update cascade on delete cascade;
end
$body$;
