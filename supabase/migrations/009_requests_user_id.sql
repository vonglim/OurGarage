-- Legacy DBs: `owner_id` was renamed in app to `user_id` (Supabase Auth user id).
-- New installs that already have `user_id` from 001 are no-ops.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where
      table_schema = 'public'
      and table_name = 'requests'
      and column_name = 'owner_id'
  ) then
    execute 'alter table public.requests rename column owner_id to user_id';
  end if;
end
$$;

comment on column public.requests.user_id is 'Request author — Supabase Auth user id.';
