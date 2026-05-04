import { logOfferSync } from '@/lib/supabaseOfferSync';
import { getSupabase } from '@/lib/supabase';

export type PersistAcceptOfferInput = {
  requestRowId: string;
  acceptedOfferId: string;
  acceptedPrice: number;
  ownerId: string;
  renterId: string;
  /** User who completed the accept action in-app. */
  lastUpdatedBy: string;
};

/**
 * Writes match + offer outcomes + rental row to Supabase.
 * Call only after `requestRowId` and offer ids exist on the server.
 */
export async function persistAcceptOfferToSupabase(
  input: PersistAcceptOfferInput
): Promise<boolean> {
  const { requestRowId, acceptedOfferId, acceptedPrice, ownerId, renterId, lastUpdatedBy } = input;
  const now = new Date().toISOString();
  const price = Number.isFinite(acceptedPrice) && acceptedPrice >= 0 ? acceptedPrice : 0;

  try {
    const supabase = getSupabase();
    logOfferSync('before_write', 'persistAcceptOffer: update requests', { requestRowId });
    const { error: e1 } = await supabase
      .from('requests')
      .update({
        matched: true,
        accepted_offer_id: acceptedOfferId,
        accepted_price: price,
      })
      .eq('id', requestRowId);
    if (e1) {
      logOfferSync('supabase_response', 'request update failed', e1.message);
      return false;
    }

    logOfferSync('supabase_response', 'request updated', { requestRowId });
    const { error: e2 } = await supabase
      .from('offers')
      .update({
        status: 'accepted',
        updated_at: now,
        current_price: price,
        price,
        last_updated_by: lastUpdatedBy,
      })
      .eq('id', acceptedOfferId);
    if (e2) {
      logOfferSync('supabase_response', 'accepted offer update failed', e2.message);
      return false;
    }

    const { error: e2b } = await supabase
      .from('offers')
      .update({ status: 'closed', updated_at: now })
      .eq('request_id', requestRowId)
      .neq('id', acceptedOfferId);
    if (e2b) {
      logOfferSync('supabase_response', 'close other offers failed', e2b.message);
      return false;
    }

    logOfferSync('before_write', 'persistAcceptOffer: insert rental', { requestRowId });
    const payload = {
      renter_user_id: renterId,
      owner_user_id: ownerId,
      request_id: requestRowId,
      price,
      duration_type: 'full' as const,
    };
    console.log('[RENTALS INSERT]', payload);
    const { error: e3 } = await supabase.from('rentals').insert(payload);
    if (e3) {
      logOfferSync('supabase_response', 'rental insert failed', e3.message);
      return false;
    }

    logOfferSync('supabase_response', 'persistAcceptOffer complete', { requestRowId });
    return true;
  } catch (e) {
    logOfferSync('supabase_response', 'persistAcceptOffer exception', e);
    return false;
  }
}
