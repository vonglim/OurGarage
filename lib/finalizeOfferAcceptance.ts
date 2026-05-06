import { router } from 'expo-router';

import { getAuthUserId } from '@/lib/auth';
import { getNumericOfferPrice } from '@/lib/money';
import { getRequestOwnerId, getRequestSupabaseRowId } from '@/lib/requestOwnership';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { insertOfferAcceptedServerNotification } from '@/lib/insertServerNotification';
import { syncRequestAndOffersFromSupabase } from '@/lib/supabaseOfferSync';
import { getOfferById } from '@/store/offersStore';
import { emitAcceptMatchSideEffects, getRequestByTimestamp, requestAcceptsOffers, resolveRequestStoreTimestamp } from '@/store/requestsStore';

export type FinalizeOfferAcceptanceResult = { ok: true } | { ok: false; error: string };

/**
 * Single entry for poster accepting an offer (direct) or confirming after renter accepted counter.
 * Supabase is updated first, then Zustand is synced, then in-app follow-ups, then navigation.
 */
export async function finalizeOfferAcceptance(
  requestId: string | number,
  offerId: string
): Promise<FinalizeOfferAcceptanceResult> {
  if (!isSupabaseConfigured()) {
    const err = 'Supabase is not configured';
    console.error('ACCEPT ERROR:', err);
    return { ok: false, error: err };
  }

  const meRaw = await getAuthUserId();
  const me = meRaw?.trim() ?? '';
  if (!me) {
    return { ok: false, error: 'Not signed in' };
  }
  const ts = resolveRequestStoreTimestamp(requestId);
  if (ts == null) {
    const err = 'Could not resolve request timestamp';
    console.error('ACCEPT ERROR:', err, { requestId });
    return { ok: false, error: err };
  }

  const requestRow = getRequestByTimestamp(ts);
  if (requestRow == null) {
    const err = 'Request not in store';
    console.error('ACCEPT ERROR:', err, { requestTimestamp: ts });
    return { ok: false, error: err };
  }

  const rec = requestRow as Record<string, unknown>;
  const requestRowId = getRequestSupabaseRowId(rec);
  if (requestRowId == null) {
    const err = 'Missing requests.id (link request to Supabase in Activity)';
    console.error('ACCEPT ERROR:', err);
    return { ok: false, error: err };
  }

  if (requestRow.matched === true) {
    const err = 'Request is already matched';
    console.error('ACCEPT ERROR:', err);
    return { ok: false, error: err };
  }
  if (!requestAcceptsOffers(ts)) {
    const err = 'This request is not accepting offers';
    console.error('ACCEPT ERROR:', err);
    return { ok: false, error: err };
  }

  const owner = getRequestOwnerId(rec);
  if (owner == null || owner !== me) {
    const err = 'Only the request owner can accept an offer here';
    console.warn('User not allowed to confirm rental', { me, requestOwnerId: owner });
    console.error('ACCEPT ERROR:', err);
    return { ok: false, error: err };
  }

  const offer = getOfferById(offerId);
  if (offer == null || offer.requestId !== ts) {
    const err = 'Offer not found for this request';
    console.error('ACCEPT ERROR:', err, { found: offer != null });
    return { ok: false, error: err };
  }

  if (offer.status === 'pending') {
    if (offer.lastUpdatedBy !== offer.renterId) {
      const err = 'You can only accept the renter’s current offer, not your own last move';
      console.error('ACCEPT ERROR:', err, { lastUpdatedBy: offer.lastUpdatedBy, renterId: offer.renterId });
      return { ok: false, error: err };
    }
  } else if (offer.status === 'pending_confirmation') {
    // Poster confirms after renter accepted counter; no extra lastUpdatedBy check
  } else {
    const err = `This offer is not in an acceptable state: ${String(offer.status)}`;
    console.error('ACCEPT ERROR:', err);
    return { ok: false, error: err };
  }

  const acceptedPrice = getNumericOfferPrice(offer);
  if (!Number.isFinite(acceptedPrice) || acceptedPrice < 0) {
    const err = 'Invalid offer price';
    console.error('ACCEPT ERROR:', err, { acceptedPrice });
    return { ok: false, error: err };
  }

  const now = new Date().toISOString();
  const acceptedOfferId = String(offer.id);
  const renterId = offer.renterId.trim();

  try {
    const supabase = getSupabase();
    const { error: e1 } = await supabase
      .from('requests')
      .update({
        matched: true,
        accepted_offer_id: acceptedOfferId,
        accepted_price: acceptedPrice,
      })
      .eq('id', requestRowId);
    if (e1) {
      console.error('CONFIRM RENTAL ERROR (requests update)', e1);
      return { ok: false, error: e1.message || 'Request update failed' };
    }

    const { error: e2 } = await supabase
      .from('offers')
      .update({
        status: 'accepted',
        updated_at: now,
        current_price: acceptedPrice,
        price: acceptedPrice,
        last_updated_by: me,
      })
      .eq('id', acceptedOfferId);
    if (e2) {
      console.error('CONFIRM RENTAL ERROR (offers update)', e2);
      return { ok: false, error: e2.message || 'Offer update failed' };
    }

    const { error: e2b } = await supabase
      .from('offers')
      .update({ status: 'closed', updated_at: now })
      .eq('request_id', requestRowId)
      .neq('id', acceptedOfferId);
    if (e2b) {
      console.error('CONFIRM RENTAL ERROR (close other offers)', e2b);
      return { ok: false, error: e2b.message || 'Could not update other offers' };
    }

    const ownerIdForRental =
      typeof rec.poster_user_id === 'string' && rec.poster_user_id.trim() !== ''
        ? rec.poster_user_id.trim()
        : typeof rec.posterUserId === 'string'
          ? rec.posterUserId.trim()
          : owner;
    const payload = {
      request_id: requestRowId,
      offer_id: offer.id,
      renter_user_id: offer.renterId,
      owner_user_id: ownerIdForRental,
      status: 'pending_meetup' as const,
      meetup_time: null,
      meetup_location: null,
      return_time: null,
      return_location: null,
      confirmed_by_renter: false,
      confirmed_by_owner: false,
      duration_type:
        (typeof requestRow.durationType === 'string' && requestRow.durationType.trim() !== ''
          ? requestRow.durationType
          : typeof rec.duration_type === 'string' && rec.duration_type.trim() !== ''
            ? rec.duration_type
            : 'fullDay'),
      price: offer.price ?? 0,
    };
    console.log('[RENTALS INSERT]', payload);
    const { data: rentalRow, error: e3 } = await supabase
      .from('rentals')
      .insert(payload)
      .select('id')
      .single();
    if (e3) {
      console.error('CONFIRM RENTAL ERROR (rentals insert)', e3);
      return { ok: false, error: e3.message || 'Rental record failed' };
    }

    void insertOfferAcceptedServerNotification({
      actorId: me,
      offerRenterId: renterId,
      requestRowId,
      offerId: acceptedOfferId,
    });

    const before = getRequestByTimestamp(ts);
    const synced = await syncRequestAndOffersFromSupabase(requestRowId, ts);
    if (!synced) {
      const err = 'Local sync from Supabase failed. Pull to refresh Activity.';
      console.error('ACCEPT ERROR:', err);
      return { ok: false, error: err };
    }
    emitAcceptMatchSideEffects(before, ts, acceptedOfferId, acceptedPrice);

    const rentalId =
      rentalRow != null && typeof (rentalRow as { id?: unknown }).id === 'string'
        ? (rentalRow as { id: string }).id
        : '';
    if (rentalId !== '') {
      router.push({
        pathname: '/rental/[id]',
        params: { id: rentalId },
      });
    } else {
      router.push({
        pathname: '/rental-agreement',
        params: {
          requestId: requestRowId,
          offerId: acceptedOfferId,
          price: String(acceptedPrice),
        },
      });
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('ACCEPT ERROR: exception', e);
    return { ok: false, error: msg || 'Unknown error' };
  }
}
