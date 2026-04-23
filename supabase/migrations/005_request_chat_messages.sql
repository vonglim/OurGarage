-- In-app DMs for matched request + offer: use public.offer_messages (see 002_offers_negotiation.sql)
-- with kind = 'user_chat' (see lib/supabaseRequestChatMessages.ts: OFFER_USER_CHAT_MESSAGE_KIND).
-- Legacy table (if 005 was applied in an old branch) is dropped; do not create a separate chat table.
drop table if exists public.request_chat_messages;
