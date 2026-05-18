import type { SupabaseClient } from '@supabase/supabase-js';

import { logRentalCancellation } from '@/lib/rentalCancellation/rentalCancellationDebug';
import { getProfileNameForUserId } from '@/lib/profileDisplayName';
import { isUuidString } from '@/lib/requestOwnership';
import type { RentalWizardRentalRow } from '@/lib/rentalWizard/types';

export const RENTAL_CANCELLATION_SYSTEM_MESSAGE_KIND = 'system_rental_cancellation';

export type RentalCancellationChatEvent = 'requested' | 'accepted' | 'declined';

function cancellationSystemMessageBody(
  event: RentalCancellationChatEvent,
  actorName: string
): string {
  const who = actorName.trim() || 'Someone';
  switch (event) {
    case 'requested':
      return `${who} requested to cancel this rental.`;
    case 'accepted':
      return `${who} accepted the cancellation request.`;
    case 'declined':
      return `${who} declined the cancellation request.`;
    default:
      return `${who} updated the cancellation request.`;
  }
}

/** Inserts an operational system line into the rental offer thread. */
export async function insertRentalCancellationSystemMessage(
  supabase: SupabaseClient,
  rental: RentalWizardRentalRow,
  actorUserId: string,
  event: RentalCancellationChatEvent
): Promise<void> {
  const offerId =
    rental.offer_id != null && isUuidString(String(rental.offer_id))
      ? String(rental.offer_id).trim()
      : '';
  if (!offerId) return;

  const ownerId = String(rental.owner_user_id ?? '').trim();
  const renterId = String(rental.renter_user_id ?? '').trim();
  const actor = actorUserId.trim();
  if (!actor) return;

  const recipientId = actor === ownerId ? renterId : ownerId;
  if (!recipientId || recipientId === actor) return;

  const actorName = getProfileNameForUserId(actor);
  const body = cancellationSystemMessageBody(event, actorName);
  const requestId =
    rental.request_id != null && isUuidString(String(rental.request_id))
      ? String(rental.request_id).trim()
      : '';

  const row: Record<string, unknown> = {
    offer_id: offerId,
    author_id: actor,
    receiver_id: recipientId,
    body,
    price: null,
    kind: RENTAL_CANCELLATION_SYSTEM_MESSAGE_KIND,
    rental_id: rental.id,
  };
  if (requestId) row.request_id = requestId;

  const { error } = await supabase.from('offer_messages').insert(row);
  if (error) {
    if (__DEV__) {
      console.warn('[rental-cancellation] system chat insert failed', error.message);
    }
    return;
  }

  logRentalCancellation('system message inserted', { rentalId: rental.id, event, offerId });
}
