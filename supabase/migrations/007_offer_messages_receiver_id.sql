alter table public.offer_messages add column if not exists receiver_id text;

comment on column public.offer_messages.receiver_id is
  'Other party in the thread; author_id is the message sender (Supabase auth user id).';
