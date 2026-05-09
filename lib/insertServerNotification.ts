import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { isUuidString } from '@/lib/requestOwnership';

/**
 * `public.notifications.type` values sent by this app. Must match DB check constraint (migrations 012, 015).
 */
export type ServerNotificationType =
  | 'offer_created'
  | 'counter_offer'
  | 'offer_updated'
  | 'offer_accepted'
  | 'message'
  | 'new_offer' /* legacy */
  | 'new_message' /* legacy */;

function dataPayload(
  requestId: string | null,
  offerId: string | null,
  rentalId: string | null
): Record<string, string> {
  const o: Record<string, string> = {};
  if (requestId) o.requestId = requestId;
  if (offerId) o.offerId = offerId;
  if (rentalId) o.rentalId = rentalId;
  return o;
}

/**
 * Inserts one `public.notifications` row for the **recipient** (never the actor). Skips if `actorId === recipientId`
 * (prevents self-notify bugs).
 */
export function insertServerNotificationToRecipient(input: {
  actorId: string;
  recipientUserId: string;
  type: ServerNotificationType;
  title: string;
  body: string;
  requestId: string | null;
  offerId: string | null;
  /** When set, clients route opens into the rental workspace (meetup / active rental). */
  rentalId?: string | null;
}): void {
  if (!isSupabaseConfigured()) return;

  const actorId = String(input.actorId ?? '').trim();
  const recipientId = String(input.recipientUserId ?? '').trim();
  if (actorId === '' || recipientId === '' || !isUuidString(recipientId)) {
    return;
  }
  if (actorId === recipientId) {
    if (__DEV__) {
      console.log('NOTIFY skip: actorId === recipientId (no self-notify)', {
        actorId,
        recipientId,
        type: input.type,
      });
    }
    return;
  }

  if (__DEV__) {
    console.log('NOTIFY →', { actorId, recipientId, type: input.type });
  }

  const requestId = input.requestId && isUuidString(input.requestId) ? input.requestId : null;
  const offerId = input.offerId && isUuidString(input.offerId) ? input.offerId : null;
  const rentalId =
    input.rentalId != null && isUuidString(String(input.rentalId).trim())
      ? String(input.rentalId).trim()
      : null;
  const data = dataPayload(requestId, offerId, rentalId);
  const supabase = getSupabase();
  void (async () => {
    const { error } = await supabase.from('notifications').insert({
      user_id: recipientId,
      type: input.type,
      title: input.title,
      body: input.body,
      data,
      read: false,
      request_id: requestId,
      offer_id: offerId,
    });
    if (error != null && __DEV__) {
      console.warn('[notifications] insert failed:', error.message);
    }
  })();
}

/**
 * Notifies the offer author that their offer was accepted.
 * `actorId` = request creator who accepted (rental borrower). `offerRenterId` = offer author
 * (`offers.user_id`, rental equipment owner) — param name is legacy from older naming.
 */
export function insertOfferAcceptedServerNotification(input: {
  /** Request creator who tapped accept (must not equal {@link offerRenterId}). */
  actorId: string;
  /** Offer author / `offers.user_id` (equipment owner); not the rental renter column semantically. */
  offerRenterId: string;
  requestRowId: string;
  offerId: string;
  rentalId?: string | null;
}): void {
  const a = String(input.actorId).trim();
  const renter = String(input.offerRenterId).trim();
  const reqId = String(input.requestRowId).trim();
  const offId = String(input.offerId).trim();
  if (a === '' || !isUuidString(renter) || !isUuidString(reqId) || !isUuidString(offId)) {
    return;
  }
  if (a === renter) {
    if (__DEV__) {
      console.log('NOTIFY skip offer_accepted: actor and renter same', { a, renter });
    }
    return;
  }
  const rentId =
    input.rentalId != null && isUuidString(String(input.rentalId).trim())
      ? String(input.rentalId).trim()
      : null;
  insertServerNotificationToRecipient({
    actorId: a,
    recipientUserId: renter,
    type: 'offer_accepted',
    title: 'Your offer was accepted',
    body: 'Your offer was accepted',
    requestId: reqId,
    offerId: offId,
    rentalId: rentId,
  });
}
