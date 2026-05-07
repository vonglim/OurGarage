create table if not exists public.conversation_reads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  offer_id uuid not null references public.offers (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, offer_id)
);

create index if not exists conversation_reads_offer_idx
  on public.conversation_reads (offer_id);

create index if not exists conversation_reads_user_idx
  on public.conversation_reads (user_id);

create or replace function public.set_conversation_reads_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists conversation_reads_updated_at on public.conversation_reads;
create trigger conversation_reads_updated_at
  before update on public.conversation_reads
  for each row execute function public.set_conversation_reads_updated_at();

alter table public.conversation_reads enable row level security;

drop policy if exists "conversation_reads_select_own" on public.conversation_reads;
create policy "conversation_reads_select_own"
  on public.conversation_reads for select
  using (user_id = auth.uid());

drop policy if exists "conversation_reads_insert_own" on public.conversation_reads;
create policy "conversation_reads_insert_own"
  on public.conversation_reads for insert
  with check (user_id = auth.uid());

drop policy if exists "conversation_reads_update_own" on public.conversation_reads;
create policy "conversation_reads_update_own"
  on public.conversation_reads for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.mark_offer_thread_read(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_offer_id is null then
    return;
  end if;
  insert into public.conversation_reads (user_id, offer_id, last_read_at)
  values (auth.uid(), p_offer_id, now())
  on conflict (user_id, offer_id)
  do update set last_read_at = excluded.last_read_at, updated_at = now();
end;
$$;

grant execute on function public.mark_offer_thread_read(uuid) to authenticated;

create or replace function public.unread_message_counts_for_user()
returns table (offer_id uuid, unread_count bigint)
language sql
security definer
set search_path = public
as $$
  select
    m.offer_id,
    count(*)::bigint as unread_count
  from public.offer_messages m
  left join public.conversation_reads cr
    on cr.offer_id = m.offer_id
   and cr.user_id = auth.uid()
  where m.receiver_id = auth.uid()
    and coalesce(m.kind, '') = 'user_chat'
    and m.created_at > coalesce(cr.last_read_at, to_timestamp(0))
  group by m.offer_id
  having count(*) > 0
$$;

grant execute on function public.unread_message_counts_for_user() to authenticated;
