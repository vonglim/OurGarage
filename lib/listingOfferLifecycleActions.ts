import { getAuthUserIdSync } from '@/lib/authUser';
import { getSupabase } from '@/lib/supabase';

export async function fetchListingOfferDetail(offerId: string): Promise<{
  row: Record<string, unknown> | null;
  messages: Record<string, unknown>[];
}> {
  const id = offerId.trim();
  if (!id) return { row: null, messages: [] };
  const supabase = getSupabase();
  const { data: row, error } = await supabase.from('offers').select('*').eq('id', id).maybeSingle();
  if (error || !row) {
    if (__DEV__) console.warn('[listing-offer-detail] offer fetch', error?.message);
    return { row: null, messages: [] };
  }
  const rec = row as Record<string, unknown>;
  if (rec.listing_id == null || String(rec.listing_id).trim() === '') {
    return { row: null, messages: [] };
  }
  const { data: msgs, error: mErr } = await supabase
    .from('offer_messages')
    .select('*')
    .eq('offer_id', id)
    .order('created_at', { ascending: true });
  if (mErr && __DEV__) console.warn('[listing-offer-detail] messages', mErr.message);
  return { row: rec, messages: (msgs ?? []) as Record<string, unknown>[] };
}

export async function ownerSetListingOfferStatus(
  offerId: string,
  nextStatus: 'accepted' | 'declined' | 'pending'
): Promise<{ ok: boolean; message?: string }> {
  const me = getAuthUserIdSync().trim();
  if (!me) return { ok: false, message: 'Sign in to continue.' };
  const id = offerId.trim();
  if (!id) return { ok: false, message: 'Missing offer.' };

  const { row } = await fetchListingOfferDetail(id);
  if (!row) return { ok: false, message: 'Offer not found.' };
  const listingId = typeof row.listing_id === 'string' ? row.listing_id.trim() : '';
  if (!listingId) return { ok: false, message: 'Not a listing offer.' };

  const supabase = getSupabase();
  const { data: listing } = await supabase.from('listings').select('user_id').eq('id', listingId).maybeSingle();
  const owner =
    listing && typeof (listing as { user_id?: unknown }).user_id === 'string'
      ? String((listing as { user_id: string }).user_id).trim()
      : '';
  if (owner !== me) {
    return { ok: false, message: 'Only the listing host can update this offer.' };
  }

  const status =
    nextStatus === 'accepted'
      ? 'pending_confirmation'
      : nextStatus === 'declined'
        ? 'declined'
        : 'pending';

  const { error } = await supabase
    .from('offers')
    .update({
      status,
      last_updated_by: me,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    return { ok: false, message: error.message || 'Could not update offer.' };
  }

  const renter = typeof row.user_id === 'string' ? row.user_id.trim() : '';
  const priceRaw = row.current_price ?? row.price;
  const price =
    typeof priceRaw === 'number' && Number.isFinite(priceRaw)
      ? priceRaw
      : typeof priceRaw === 'string' && priceRaw.trim() !== ''
        ? Number(priceRaw)
        : null;
  if (renter && me !== renter) {
    const body =
      nextStatus === 'accepted'
        ? 'The host accepted your listing offer.'
        : nextStatus === 'declined'
          ? 'The host declined your listing offer.'
          : 'Offer updated.';
    await supabase.from('offer_messages').insert({
      request_id: null,
      offer_id: id,
      author_id: me,
      receiver_id: renter,
      body,
      price: price != null && Number.isFinite(price) ? price : null,
      kind: 'note',
    });
  }

  return { ok: true };
}
