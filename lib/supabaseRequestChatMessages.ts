import { fetchAndMergeProfileNames } from '@/lib/remoteProfileCache';
import { getSupabase } from '@/lib/supabase';

/** Distinguishes in-app post-accept DMs in offer_messages. */
export const OFFER_USER_CHAT_MESSAGE_KIND = 'user_chat';

/** Row from `public.offer_messages` (may include all columns; select('*')). */
export type SupabaseRequestChatMessageRow = {
  id: string;
  request_id?: string | null;
  offer_id: string;
  author_id: string;
  receiver_id: string | null;
  body: string | null;
  price: number | null;
  kind: string;
  created_at: string;
  [key: string]: unknown;
};

export type InsertRequestChatMessageResult = {
  data: { id: string } | null;
  error: { message: string; code?: string; details?: string; hint?: string } | null;
};

/**
 * Inserts into `offer_messages` with `request_id` + `offer_id` so the thread is queryable by request.
 * No client-side filter by current user: both parties load the same query.
 */
export async function insertRequestChatMessageToSupabase(input: {
  requestRowId?: string | null;
  offerId: string;
  authorId: string;
  /** Counterparty; must not equal `authorId` (both are Supabase auth `user` ids or equivalent string ids). */
  receiverId: string;
  body: string;
}): Promise<InsertRequestChatMessageResult> {
  const supabase = getSupabase();
  const body = String(input.body ?? '').trim();
  const base: Record<string, unknown> = {
    offer_id: input.offerId.trim(),
    author_id: input.authorId.trim(),
    receiver_id: input.receiverId.trim(),
    body,
    price: null,
    kind: OFFER_USER_CHAT_MESSAGE_KIND,
  };
  const rid = input.requestRowId != null && String(input.requestRowId).trim() !== '' ? String(input.requestRowId).trim() : '';
  if (rid !== '') {
    base.request_id = rid;
  }
  const { data, error } = await supabase
    .from('offer_messages')
    .insert(base)
    .select('id')
    .single();
  if (error != null) {
    if (__DEV__) console.warn('[offer_messages] insert:', error.message);
    return { data: null, error };
  }
  const row = data as { id?: string } | null;
  if (row == null || typeof row.id !== 'string') {
    return { data: null, error: { message: 'No row returned' } };
  }
  return { data: { id: row.id }, error: null };
}

async function fetchOfferMessagesByOfferId(offerId: string): Promise<SupabaseRequestChatMessageRow[] | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('offer_messages')
    .select('*')
    .eq('offer_id', offerId)
    .order('created_at', { ascending: true });
  if (error) {
    if (__DEV__) console.warn('[offer_messages] fetch by offer_id:', error.message);
    return null;
  }
  const list = (data ?? []) as SupabaseRequestChatMessageRow[];
  const authorIds = list
    .map((row) => (typeof row.author_id === 'string' ? row.author_id.trim() : ''))
    .filter((s) => s.length > 0);
  await fetchAndMergeProfileNames(supabase, authorIds);
  return list;
}

/**
 * Loads the message thread: prefers `request_id` (all rows for that request), with no per-user or kind filter.
 * If that returns no rows (or errors), falls back to `offer_id` only. Never ANDs the two in one query.
 * Always `order by created_at asc` on each attempt.
 */
export async function fetchRequestChatMessagesFromSupabase(
  requestRowId: string | null | undefined,
  offerId: string
): Promise<SupabaseRequestChatMessageRow[] | null> {
  const supabase = getSupabase();
  const oid = offerId.trim();
  if (!oid) {
    return null;
  }
  const rid = requestRowId != null && String(requestRowId).trim() !== '' ? String(requestRowId).trim() : '';
  if (rid) {
    const { data, error } = await supabase
      .from('offer_messages')
      .select('*')
      .eq('request_id', rid)
      .order('created_at', { ascending: true });
    if (error) {
      if (__DEV__) {
        console.warn('[offer_messages] fetch by request_id (will try offer_id):', error.message);
      }
      return await fetchOfferMessagesByOfferId(oid);
    }
    const fromRequest = (data ?? []) as SupabaseRequestChatMessageRow[];
    const authorIds = fromRequest
      .map((row) => (typeof row.author_id === 'string' ? row.author_id.trim() : ''))
      .filter((s) => s.length > 0);
    await fetchAndMergeProfileNames(supabase, authorIds);
    if (fromRequest.length > 0) {
      return fromRequest;
    }
  }
  return await fetchOfferMessagesByOfferId(oid);
}
