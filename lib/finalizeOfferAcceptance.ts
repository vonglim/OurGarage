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
  console.log('handleConfirmRental / finalizeOfferAcceptance start', { requestId, offerId });
  console.log('ACCEPT STEP 1: start', { requestId, offerId });

  if (!isSupabaseConfigured()) {
    const err = 'Supabase is not configured';
    console.log('ACCEPT ERROR:', err);
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
    console.log('ACCEPT ERROR:', err, { requestId });
    return { ok: false, error: err };
  }

  const requestRow = getRequestByTimestamp(ts);
  if (requestRow == null) {
    const err = 'Request not in store';
    console.log('ACCEPT ERROR:', err, { requestTimestamp: ts });
    return { ok: false, error: err };
  }

  const rec = requestRow as Record<string, unknown>;
  const requestRowId = getRequestSupabaseRowId(rec);
  if (requestRowId == null) {
    const err = 'Missing requests.id (link request to Supabase in Activity)';
    console.log('ACCEPT ERROR:', err);
    return { ok: false, error: err };
  }

  if (requestRow.matched === true) {
    const err = 'Request is already matched';
    console.log('ACCEPT ERROR:', err);
    return { ok: false, error: err };
  }
  if (!requestAcceptsOffers(ts)) {
    const err = 'This request is not accepting offers';
    console.log('ACCEPT ERROR:', err);
    return { ok: false, error: err };
  }

  const owner = getRequestOwnerId(rec);
  if (owner == null || owner !== me) {
    const err = 'Only the request owner can accept an offer here';
    console.warn('User not allowed to confirm rental', { me, requestOwnerId: owner });
    console.log('ACCEPT ERROR:', err);
    return { ok: false, error: err };
  }

  const offer = getOfferById(offerId);
  if (offer == null || offer.requestId !== ts) {
    const err = 'Offer not found for this request';
    console.log('ACCEPT ERROR:', err, { found: offer != null });
    return { ok: false, error: err };
  }

  if (offer.status === 'pending') {
    if (offer.lastUpdatedBy !== offer.renterId) {
      const err = 'You can only accept the renter’s current offer, not your own last move';
      console.log('ACCEPT ERROR:', err, { lastUpdatedBy: offer.lastUpdatedBy, renterId: offer.renterId });
      return { ok: false, error: err };
    }
  } else if (offer.status === 'pending_confirmation') {
    // Poster confirms after renter accepted counter; no extra lastUpdatedBy check
  } else {
    const err = `This offer is not in an acceptable state: ${String(offer.status)}`;
    console.log('ACCEPT ERROR:', err);
    return { ok: false, error: err };
  }

  const acceptedPrice = getNumericOfferPrice(offer);
  if (!Number.isFinite(acceptedPrice) || acceptedPrice < 0) {
    const err = 'Invalid offer price';
    console.log('ACCEPT ERROR:', err, { acceptedPrice });
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
    console.log('ACCEPT STEP 2: request updated');

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
    console.log('ACCEPT STEP 3: offer updated');

    const { error: e2b } = await supabase
      .from('offers')
      .update({ status: 'closed', updated_at: now })
      .eq('request_id', requestRowId)
      .neq('id', acceptedOfferId);
    if (e2b) {
      console.error('CONFIRM RENTAL ERROR (close other offers)', e2b);
      return { ok: false, error: e2b.message || 'Could not update other offers' };
    }
    console.log('ACCEPT STEP 4: other offers declined/closed for this request');

    const { error: e3 } = await supabase.from('rentals').insert({
      request_id: requestRowId,
      offer_id: acceptedOfferId,
      owner_id: owner,
      renter_id: renterId,
      price: acceptedPrice,
      status: 'active',
    });
    if (e3) {
      console.error('CONFIRM RENTAL ERROR (rentals insert)', e3);
      return { ok: false, error: e3.message || 'Rental record failed' };
    }
    console.log('ACCEPT STEP 5: rental record created');
    console.log('Rental confirmed successfully');

    void insertOfferAcceptedServerNotification({
      actorId: me,
      offerRenterId: renterId,
      requestRowId,
      offerId: acceptedOfferId,
    });

    console.log('ACCEPT STEP 6: all Supabase calls complete');

    const before = getRequestByTimestamp(ts);
    const synced = await syncRequestAndOffersFromSupabase(requestRowId, ts);
    if (!synced) {
      const err = 'Local sync from Supabase failed. Pull to refresh Activity.';
      console.log('ACCEPT ERROR:', err);
      return { ok: false, error: err };
    }
    emitAcceptMatchSideEffects(before, ts, acceptedOfferId, acceptedPrice);
    console.log('ACCEPT COMPLETE');

    router.push({
      pathname: '/rental-agreement',
      params: {
        requestId: requestRowId,
        offerId: acceptedOfferId,
        price: String(acceptedPrice),
      },
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log('ACCEPT ERROR: exception', e);
    return { ok: false, error: msg || 'Unknown error' };
  }
}
