-- Include offer_messages in realtime so INSERT payloads carry all columns (including offer_images).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'offer_messages'
     ) then
    alter publication supabase_realtime add table public.offer_messages;
  end if;
end $$;
