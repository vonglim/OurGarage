import { logOfferSync } from '@/lib/supabaseOfferSync';
import { getSupabase } from '@/lib/supabase';

function receiverIdForOfferMessage(author: string, poster: string | null, renter: string): string | null {
  const a = author.trim();
  const r = renter.trim();
  const p = typeof poster === 'string' ? poster.trim() : '';
  if (!a || !r) return null;
  if (p && p === r) return null;
  if (p && a === p) return r;
  if (a === r) return p || null;
  return null;
}

export type NegotiationOfferStatus =
  | 'pending'
  | 'pending_confirmation'
  | 'accepted'
  | 'declined'
  | 'closed';

export type OfferMessageKind =
  | 'initial'
  | 'renter_update'
  | 'poster_counter'
  | 'renter_accepts'
  | 'declined'
  | 'accepted';

export async function upsertNegotiationOfferToSupabase(input: {
  requestRowId: string;
  /** Request owner; used with `renterId` to set `offer_messages.receiver_id`. */
  posterUserId: string | null;
  renterId: string;
  currentPrice: number;
  lastUpdatedBy: string;
  status?: NegotiationOfferStatus;
  message?: string;
  posterCounterCount?: number;
  messageKind: OfferMessageKind;
}): Promise<{ id: string } | null> {
  const supabase = getSupabase();
  const status = input.status ?? 'pending';
  const msg = input.message?.trim();

  logOfferSync('before_write', 'upsertNegotiationOfferToSupabase', {
    requestRowId: input.requestRowId,
    messageKind: input.messageKind,
  });

  const { data: found, error: selErr } = await supabase
    .from('offers')
    .select('id')
    .eq('request_id', input.requestRowId)
    .eq('user_id', input.renterId)
    .maybeSingle();

  if (selErr && __DEV__) console.warn('[Negotiation] select offer:', selErr.message);

  const existingId =
    found && typeof (found as { id?: unknown }).id === 'string'
      ? String((found as { id: string }).id).trim()
      : '';

  const baseFields: Record<string, unknown> = {
    current_price: input.currentPrice,
    price: input.currentPrice,
    last_updated_by: input.lastUpdatedBy,
    status,
    poster_counter_count: input.posterCounterCount ?? 0,
    updated_at: new Date().toISOString(),
  };
  if (msg) baseFields.message = msg;

  let offerId: string;

  if (existingId) {
    offerId = existingId;
    const { error: upErr } = await supabase.from('offers').update(baseFields).eq('id', offerId);
    if (upErr) {
      logOfferSync('supabase_response', 'offer update failed', upErr.message);
      return null;
    }
  } else {
    const insertRow: Record<string, unknown> = {
      ...baseFields,
      request_id: input.requestRowId,
      user_id: input.renterId,
    };
    const { data: ins, error: inErr } = await supabase
      .from('offers')
      .insert(insertRow)
      .select('id')
      .single();
    if (inErr || !ins || typeof (ins as { id?: unknown }).id !== 'string') {
      if (inErr) logOfferSync('supabase_response', 'offer insert failed', inErr.message);
      return null;
    }
    offerId = String((ins as { id: string }).id);
  }

  const receiverId = receiverIdForOfferMessage(
    input.lastUpdatedBy,
    input.posterUserId,
    input.renterId
  );

  const { error: msgErr } = await supabase.from('offer_messages').insert({
    request_id: input.requestRowId,
    offer_id: offerId,
    author_id: input.lastUpdatedBy,
    receiver_id: receiverId,
    body: msg ?? null,
    price: input.currentPrice,
    kind: input.messageKind,
  });
  if (msgErr) {
    logOfferSync('supabase_response', 'offer_messages insert failed', msgErr.message);
    return null;
  }

  logOfferSync('supabase_response', 'upsertNegotiationOfferToSupabase ok', { id: offerId });
  return { id: offerId };
}
