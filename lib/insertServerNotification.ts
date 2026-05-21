import { logScenario } from '@/lib/rentalLifecycle/scenarioDevLog';
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
  | 'new_message' /* legacy */
  | 'rental_confirmed'
  | 'rental_cancellation'
  | 'rental_cancellation_requested'
  | 'rental_cancellation_accepted'
  | 'rental_cancellation_declined';

function dataPayload(
  requestId: string | null,
  offerId: string | null,
  rentalId: string | null,
  listingId: string | null,
  extra?: Record<string, string>
): Record<string, string> {
  const o: Record<string, string> = {};
  if (requestId) o.requestId = requestId;
  if (offerId) o.offerId = offerId;
  if (rentalId) o.rentalId = rentalId;
  if (listingId) o.listingId = listingId;
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v.trim()) o[k] = v.trim();
    }
  }
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
  /** When set, stored in `data` for listing-offer deep links. */
  listingId?: string | null;
  meetupAcceptanceKind?: 'pickup' | 'return' | 'extension' | null;
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

  logScenario('notification', {
    event: 'server_notification_enqueue',
    notificationType: input.type,
    rentalId: input.rentalId ?? null,
    offerId: input.offerId ?? null,
    meetupAcceptanceKind: input.meetupAcceptanceKind ?? null,
    source: 'insertServerNotificationToRecipient',
  });

  void insertServerNotificationToRecipientAsync(input);
}

/**
 * Awaitable insert — use for lifecycle-critical alerts (cancellation, etc.) so failures are visible.
 */
export async function insertServerNotificationToRecipientAsync(input: {
  actorId: string;
  recipientUserId: string;
  type: ServerNotificationType;
  title: string;
  body: string;
  requestId: string | null;
  offerId: string | null;
  rentalId?: string | null;
  listingId?: string | null;
  meetupAcceptanceKind?: 'pickup' | 'return' | 'extension' | null;
}): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const actorId = String(input.actorId ?? '').trim();
  const recipientId = String(input.recipientUserId ?? '').trim();
  if (actorId === '' || recipientId === '' || !isUuidString(recipientId)) {
    return false;
  }
  if (actorId === recipientId) {
    if (__DEV__) {
      console.log('NOTIFY skip: actorId === recipientId (no self-notify)', {
        actorId,
        recipientId,
        type: input.type,
      });
    }
    return false;
  }

  logScenario('notification', {
    event: 'server_notification_insert',
    notificationType: input.type,
    rentalId: input.rentalId ?? null,
    offerId: input.offerId ?? null,
    source: 'insertServerNotificationToRecipientAsync',
  });

  const requestId = input.requestId && isUuidString(input.requestId) ? input.requestId : null;
  const offerId = input.offerId && isUuidString(input.offerId) ? input.offerId : null;
  const rentalId =
    input.rentalId != null && isUuidString(String(input.rentalId).trim())
      ? String(input.rentalId).trim()
      : null;
  const listingIdClean =
    input.listingId != null && isUuidString(String(input.listingId).trim())
      ? String(input.listingId).trim()
      : null;
  const data = dataPayload(requestId, offerId, rentalId, listingIdClean, {
    ...(input.meetupAcceptanceKind ? { meetupAcceptanceKind: input.meetupAcceptanceKind } : {}),
  });
  const supabase = getSupabase();
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
  if (error != null) {
    console.warn('[notifications] insert failed:', input.type, error.message);
    return false;
  }
  return true;
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
