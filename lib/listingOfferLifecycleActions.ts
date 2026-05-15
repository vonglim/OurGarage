import { getAuthUserIdSync } from '@/lib/authUser';
import {
  convertPendingToBooked,
} from '@/lib/listingAvailability';
import { hydrateListingOffersFromSupabase } from '@/lib/hydrateListingOffersFromSupabase';
import { ownerDeclineListingOfferProposal } from '@/lib/listingOfferNegotiationActions';
import { mergeRecentNotificationsFromServer } from '@/lib/notificationsServerSync';
import { getSupabase } from '@/lib/supabase';
import { hydrateListingAvailability } from '@/store/listingAvailabilityStore';

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

function parseAcceptListingOfferRpcResult(data: unknown): {
  ok: boolean;
  rental_id?: string;
  error?: string;
} {
  if (data == null) return { ok: false, error: 'Empty response' };
  let o: Record<string, unknown>;
  if (typeof data === 'string') {
    try {
      o = JSON.parse(data) as Record<string, unknown>;
    } catch {
      return { ok: false, error: 'Invalid response' };
    }
  } else if (typeof data === 'object' && !Array.isArray(data)) {
    o = data as Record<string, unknown>;
  } else {
    return { ok: false, error: 'Invalid response' };
  }
  if (o.ok === true) {
    const rid = typeof o.rental_id === 'string' ? o.rental_id.trim() : '';
    return { ok: true, rental_id: rid };
  }
  const err = typeof o.error === 'string' && o.error.trim() !== '' ? o.error.trim() : 'Accept failed';
  return { ok: false, error: err };
}

export async function ownerSetListingOfferStatus(
  offerId: string,
  nextStatus: 'accepted' | 'declined'
): Promise<{ ok: boolean; message?: string; rentalId?: string; negotiationClosed?: boolean }> {
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

  if (nextStatus === 'accepted') {
    const current = typeof row.status === 'string' ? row.status.trim() : '';
    if (current === 'accepted') {
      mergeRecentNotificationsFromServer();
      void hydrateListingOffersFromSupabase();
      return { ok: true };
    }
    if (current !== 'pending' && current !== 'pending_confirmation') {
      return { ok: false, message: 'Only a pending offer can be accepted.' };
    }

    const { data: rpcData, error: rpcErr } = await supabase.rpc('accept_listing_offer_create_rental', {
      p_offer_id: id,
    });
    if (rpcErr) {
      return { ok: false, message: rpcErr.message || 'Could not accept offer.' };
    }
    const parsed = parseAcceptListingOfferRpcResult(rpcData);
    if (!parsed.ok) {
      return { ok: false, message: parsed.error ?? 'Could not accept offer.' };
    }

    void convertPendingToBooked(id);
    void hydrateListingAvailability(listingId);

    const renter = typeof row.user_id === 'string' ? row.user_id.trim() : '';
    const priceRaw = row.current_price ?? row.price;
    const price =
      typeof priceRaw === 'number' && Number.isFinite(priceRaw)
        ? priceRaw
        : typeof priceRaw === 'string' && priceRaw.trim() !== ''
          ? Number(priceRaw)
          : null;
    if (renter && me !== renter) {
      await supabase.from('offer_messages').insert({
        request_id: null,
        offer_id: id,
        author_id: me,
        receiver_id: renter,
        body: 'The host accepted your listing offer.',
        price: price != null && Number.isFinite(price) ? price : null,
        kind: 'note',
      });
    }

    mergeRecentNotificationsFromServer();
    void hydrateListingOffersFromSupabase();

    const rid = parsed.rental_id?.trim();
    return { ok: true, ...(rid ? { rentalId: rid } : {}) };
  }

  return ownerDeclineListingOfferProposal(id, {});
}
