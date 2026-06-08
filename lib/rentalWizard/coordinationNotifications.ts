import {
  insertServerNotificationToRecipientAsync,
  type ServerNotificationType,
} from '@/lib/insertServerNotification';
import { getProfileNameForUserId } from '@/lib/profileDisplayName';
import { isUuidString } from '@/lib/requestOwnership';
import type { RentalMeetupRow } from '@/lib/rentalMeetupProposalLifecycle';
import {
  logCoordinationNotification,
  type CoordinationMeetupLane,
  type CoordinationNotificationKind,
} from '@/lib/rentalWizard/coordinationInstrumentation';

function notificationTypeForKind(kind: CoordinationNotificationKind): ServerNotificationType {
  switch (kind) {
    case 'pickup_proposal_received':
    case 'return_proposal_received':
      return kind;
    case 'pickup_confirmed':
    case 'return_confirmed':
      return kind;
    default:
      return 'message';
  }
}

function meetupAcceptanceKindForNotification(
  kind: CoordinationNotificationKind
): 'pickup' | 'return' | null {
  if (kind === 'pickup_confirmed') return 'pickup';
  if (kind === 'return_confirmed') return 'return';
  return null;
}

export async function insertMeetupCoordinationNotification(input: {
  rental: Pick<RentalMeetupRow, 'id' | 'owner_user_id' | 'renter_user_id' | 'request_id' | 'offer_id' | 'listing_id'>;
  actorId: string;
  recipientUserId: string;
  kind: CoordinationNotificationKind;
  lane: CoordinationMeetupLane;
  proposalVersion?: number | null;
  itemTitle?: string | null;
}): Promise<boolean> {
  const actorId = input.actorId.trim();
  const recipientId = input.recipientUserId.trim();
  const rentalId = input.rental.id.trim();
  if (!actorId || !recipientId || recipientId === actorId || !isUuidString(rentalId)) {
    logCoordinationNotification({
      event: 'skipped',
      reason: 'invalid_actor_or_recipient',
      rentalId,
      kind: input.kind,
      lane: input.lane,
      proposalCreator: actorId,
      recipient: recipientId,
    });
    return false;
  }

  const actorName = getProfileNameForUserId(actorId);
  const title = (() => {
    switch (input.kind) {
      case 'pickup_proposal_received':
        return 'Pickup proposal received';
      case 'return_proposal_received':
        return 'Return proposal received';
      case 'pickup_confirmed':
        return 'Pickup details confirmed';
      case 'return_confirmed':
        return 'Return details confirmed';
      default:
        return 'Rental update';
    }
  })();

  const body = (() => {
    const item = input.itemTitle?.trim();
    switch (input.kind) {
      case 'pickup_proposal_received':
        return item
          ? `${actorName} proposed pickup details for ${item}. Open your rental guide to review.`
          : `${actorName} proposed pickup details. Open your rental guide to review.`;
      case 'return_proposal_received':
        return item
          ? `${actorName} proposed return details for ${item}. Open your rental guide to review.`
          : `${actorName} proposed return details. Open your rental guide to review.`;
      case 'pickup_confirmed':
        return item
          ? `${item} — pickup location and time are confirmed.`
          : 'Pickup location and time are confirmed.';
      case 'return_confirmed':
        return item
          ? `${item} — return location and time are confirmed.`
          : 'Return location and time are confirmed.';
      default:
        return '';
    }
  })();

  logCoordinationNotification({
    event: 'creating',
    rentalId,
    kind: input.kind,
    lane: input.lane,
    proposalCreator: actorId,
    recipient: recipientId,
    proposal_version: input.proposalVersion ?? null,
  });

  const requestId =
    input.rental.request_id != null && isUuidString(String(input.rental.request_id))
      ? String(input.rental.request_id)
      : null;
  const offerId =
    input.rental.offer_id != null && isUuidString(String(input.rental.offer_id))
      ? String(input.rental.offer_id)
      : null;
  const listingId =
    input.rental.listing_id != null && isUuidString(String(input.rental.listing_id))
      ? String(input.rental.listing_id)
      : null;

  const ok = await insertServerNotificationToRecipientAsync({
    actorId,
    recipientUserId: recipientId,
    type: notificationTypeForKind(input.kind),
    title,
    body,
    requestId,
    offerId,
    rentalId,
    listingId,
    meetupAcceptanceKind: meetupAcceptanceKindForNotification(input.kind),
  });

  logCoordinationNotification({
    event: ok ? 'created' : 'failed',
    rentalId,
    kind: input.kind,
    lane: input.lane,
    proposalCreator: actorId,
    recipient: recipientId,
    proposal_version: input.proposalVersion ?? null,
    notificationCreated: ok,
  });

  return ok;
}
