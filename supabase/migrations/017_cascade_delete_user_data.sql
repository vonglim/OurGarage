-- Unblock Supabase "Authentication → Delete user" by making app tables cascade from
-- `public.profiles` (which already `ON DELETE CASCADE` from `auth.users`).
-- If a constraint add fails, clear orphan rows, then re-run. Order for manual deletes:
--   delete from public.offer_messages;
--   delete from public.offers;
--   delete from public.rentals; delete from public.notifications;
--   delete from public.requests; delete from public.profiles;
do $body$
declare
  r record;
begin
  if to_regclass('public.profiles') is null then
    return;
  end if;

  -- 1) notifications: drop any user_id FK, re-add -> profiles
  if to_regclass('public.notifications') is not null
     and exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'notifications' and column_name = 'user_id' and udt_name = 'uuid') then
    for r in
      select c.conname, pg_get_constraintdef(c.oid) as d
      from pg_constraint c
      where c.conrelid = 'public.notifications'::regclass and c.contype = 'f'
    loop
      if r.d ~* 'FOREIGN KEY \(user_id\)' then
        execute format('alter table public.notifications drop constraint %I', r.conname);
      end if;
    end loop;
    alter table public.notifications
      add constraint notifications_user_id_profiles_fkey
        foreign key (user_id) references public.profiles (id) on update cascade on delete cascade;
  end if;

  -- 2) offers: single-column FK on user_id -> drop all variants, re-add with CASCADE
  if to_regclass('public.offers') is not null
     and exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'offers' and column_name = 'user_id' and udt_name = 'uuid') then
    for r in
      select c.conname, pg_get_constraintdef(c.oid) as d
      from pg_constraint c
      where c.conrelid = 'public.offers'::regclass and c.contype = 'f'
    loop
      if r.d ~* 'FOREIGN KEY \(user_id\)' then
        execute format('alter table public.offers drop constraint %I', r.conname);
      end if;
    end loop;
    alter table public.offers
      add constraint offers_user_id_fkey
        foreign key (user_id) references public.profiles (id) on update cascade on delete cascade;
  end if;

  -- 3) requests: same (replaces `auth.users` or non-cascading FKs)
  if to_regclass('public.requests') is not null
     and exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'requests' and column_name = 'user_id' and udt_name = 'uuid') then
    for r in
      select c.conname, pg_get_constraintdef(c.oid) as d
      from pg_constraint c
      where c.conrelid = 'public.requests'::regclass and c.contype = 'f'
    loop
      if r.d ~* 'FOREIGN KEY \(user_id\)' then
        execute format('alter table public.requests drop constraint %I', r.conname);
      end if;
    end loop;
    alter table public.requests
      add constraint requests_user_id_fkey
        foreign key (user_id) references public.profiles (id) on update cascade on delete cascade;
  end if;
end
$body$;

-- 4) rentals: owner/renter -> profiles; do not drop `request_id` or other FKs
do $body$
declare
  r record;
  col_ty text;
begin
  if to_regclass('public.rentals') is null or to_regclass('public.profiles') is null then
    return;
  end if;

  for r in
    select c.conname, pg_get_constraintdef(c.oid) as d
    from pg_constraint c
    where c.conrelid = 'public.rentals'::regclass and c.contype = 'f'
  loop
    if r.d ~* 'FOREIGN KEY \(owner_id\)|FOREIGN KEY \(renter_id\)' then
      execute format('alter table public.rentals drop constraint if exists %I', r.conname);
    end if;
  end loop;

  select c.udt_name
    into col_ty
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'rentals' and c.column_name = 'owner_id'
  limit 1;
  if col_ty is not null and col_ty in ('text', 'varchar', 'character varying', 'name', 'bpchar') then
    execute 'alter table public.rentals alter column owner_id type uuid using (btrim(owner_id::text)::uuid)';
  end if;

  select c.udt_name
    into col_ty
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'rentals' and c.column_name = 'renter_id'
  limit 1;
  if col_ty is not null and col_ty in ('text', 'varchar', 'character varying', 'name', 'bpchar') then
    execute 'alter table public.rentals alter column renter_id type uuid using (btrim(renter_id::text)::uuid)';
  end if;

  if not exists (select 1 from pg_constraint where conname = 'rentals_owner_id_profiles_fkey' and conrelid = 'public.rentals'::regclass) then
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'rentals' and column_name = 'owner_id' and udt_name = 'uuid') then
      alter table public.rentals
        add constraint rentals_owner_id_profiles_fkey
          foreign key (owner_id) references public.profiles (id) on update cascade on delete cascade;
    end if;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rentals_renter_id_profiles_fkey' and conrelid = 'public.rentals'::regclass) then
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'rentals' and column_name = 'renter_id' and udt_name = 'uuid') then
      alter table public.rentals
        add constraint rentals_renter_id_profiles_fkey
          foreign key (renter_id) references public.profiles (id) on update cascade on delete cascade;
    end if;
  end if;
end
$body$;

-- 5) offer_messages: offer_id -> offers is unchanged; add author/receiver -> profiles
do $body$
declare
  r record;
  col_ty text;
  recv_nullable text;
begin
  if to_regclass('public.offer_messages') is null or to_regclass('public.profiles') is null then
    return;
  end if;

  for r in
    select c.conname, pg_get_constraintdef(c.oid) as d
    from pg_constraint c
    where c.conrelid = 'public.offer_messages'::regclass and c.contype = 'f'
  loop
    if r.d ~* 'FOREIGN KEY \(author_id\)|FOREIGN KEY \(receiver_id\)' then
      execute format('alter table public.offer_messages drop constraint if exists %I', r.conname);
    end if;
  end loop;

  select c.udt_name
    into col_ty
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'offer_messages' and c.column_name = 'author_id'
  limit 1;
  if col_ty is not null and col_ty in ('text', 'varchar', 'character varying', 'name', 'bpchar') then
    execute 'alter table public.offer_messages alter column author_id type uuid using (btrim(author_id::text)::uuid)';
  end if;

  select c.udt_name, c.is_nullable
    into col_ty, recv_nullable
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'offer_messages' and c.column_name = 'receiver_id'
  limit 1;
  if col_ty is not null and col_ty in ('text', 'varchar', 'character varying', 'name', 'bpchar') then
    if recv_nullable = 'NO' then
      execute 'alter table public.offer_messages alter column receiver_id type uuid using (btrim(receiver_id::text)::uuid)';
    else
      execute $sql$
        update public.offer_messages
        set receiver_id = null
        where receiver_id is not null and btrim(receiver_id::text) = ''
      $sql$;
      execute $sql$
        alter table public.offer_messages
          alter column receiver_id type uuid
          using (
            case
              when receiver_id is null then null
              else btrim(receiver_id::text)::uuid
            end
          )
      $sql$;
    end if;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'offer_messages_author_id_profiles_fkey' and conrelid = 'public.offer_messages'::regclass) then
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'offer_messages' and column_name = 'author_id' and udt_name = 'uuid') then
      alter table public.offer_messages
        add constraint offer_messages_author_id_profiles_fkey
          foreign key (author_id) references public.profiles (id) on update cascade on delete cascade;
    end if;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'offer_messages_receiver_id_profiles_fkey' and conrelid = 'public.offer_messages'::regclass) then
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'offer_messages' and column_name = 'receiver_id' and udt_name = 'uuid') then
      alter table public.offer_messages
        add constraint offer_messages_receiver_id_profiles_fkey
          foreign key (receiver_id) references public.profiles (id) on update cascade on delete cascade;
    end if;
  end if;
end
$body$;
