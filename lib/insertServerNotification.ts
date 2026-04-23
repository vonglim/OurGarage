import { shouldBlockSelfNotificationToUserId } from '@/lib/notificationRecipientGuard';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { isUuidString } from '@/lib/requestOwnership';

type InsertInput = {
  /** Supabase `notifications.user_id` — the user who should see this (never the sending actor by mistake). */
  recipientUserId: string;
  type: 'new_message' | 'new_offer' | 'offer_accepted' | 'counter_offer';
  title: string;
  body: string;
  requestId: string | null;
  offerId: string | null;
};

function dataPayload(
  requestId: string | null,
  offerId: string | null
): Record<string, string> {
  const o: Record<string, string> = {};
  if (requestId) o.requestId = requestId;
  if (offerId) o.offerId = offerId;
  return o;
}

/**
 * Inserts `public.notifications` (`user_id` = `recipientUserId` only; never the actor).
 * Fire-and-forget; dev logs on error. Does not alter in-app or UI stores.
 */
export function insertServerNotificationRow(input: InsertInput): void {
  if (!isSupabaseConfigured()) return;
  if (shouldBlockSelfNotificationToUserId(input.recipientUserId)) {
    return;
  }
  const userId = input.recipientUserId.trim();
  if (userId === '' || !isUuidString(userId)) return;
  const requestId = input.requestId && isUuidString(input.requestId) ? input.requestId : null;
  const offerId = input.offerId && isUuidString(input.offerId) ? input.offerId : null;
  const data = dataPayload(requestId, offerId);
  const supabase = getSupabase();
  void (async () => {
    const { error } = await supabase.from('notifications').insert({
      user_id: userId,
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

/** The offer author (renter) after the request owner finalizes accept in `finalizeOfferAcceptance`. */
export function insertOfferAcceptedServerNotification(input: {
  offerSenderUserId: string;
  requestRowId: string;
  offerId: string;
}): void {
  if (!isSupabaseConfigured()) return;
  if (shouldBlockSelfNotificationToUserId(input.offerSenderUserId)) {
    return;
  }
  const r = input.offerSenderUserId.trim();
  const reqId = input.requestRowId.trim();
  const offId = input.offerId.trim();
  if (r === '' || !isUuidString(r) || !isUuidString(reqId) || !isUuidString(offId)) {
    return;
  }
  const data = dataPayload(reqId, offId);
  const supabase = getSupabase();
  void (async () => {
    const { error } = await supabase.from('notifications').insert({
      user_id: r,
      type: 'offer_accepted' as const,
      title: 'Offer accepted',
      body: 'Your offer was accepted',
      data,
      read: false,
      request_id: reqId,
      offer_id: offId,
    });
    if (error != null && __DEV__) {
      console.warn('[notifications] offer_accepted insert failed:', error.message);
    }
  })();
}
