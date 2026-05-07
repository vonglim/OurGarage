-- Count meetup proposal rows toward unread (same pipeline as user_chat).

create or replace function public.unread_message_counts_for_user()
returns table (offer_id uuid, unread_count bigint)
language sql
security definer
set search_path = public
as $$
  -- Normalize UUID-ish columns via text: some projects have offer_messages / conversation_reads
  -- columns stored as text, or mixed types vs auth.uid(), which breaks direct uuid = uuid joins.
  select
    (m.offer_id::text)::uuid as offer_id,
    count(*)::bigint as unread_count
  from public.offer_messages m
  left join public.conversation_reads cr
    on cr.offer_id::text = m.offer_id::text
   and cr.user_id::text = auth.uid()::text
  where m.offer_id is not null
    and m.receiver_id::text = auth.uid()::text
    and coalesce(m.kind, '') in ('user_chat', 'meetup_proposal')
    and m.created_at > coalesce(cr.last_read_at, to_timestamp(0))
  group by (m.offer_id::text)::uuid
  having count(*) > 0
$$;

grant execute on function public.unread_message_counts_for_user() to authenticated;
