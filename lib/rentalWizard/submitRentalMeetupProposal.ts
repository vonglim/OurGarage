import { Alert } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getProfileNameForUserId } from '@/lib/profileDisplayName';
import { insertMeetupProposalOfferMessage } from '@/lib/meetupProposalThreadEvent';
import { insertMeetupCoordinationTimelineForRental } from '@/lib/meetupCoordinationTimeline';
import { insertServerNotificationToRecipient } from '@/lib/insertServerNotification';
import { evaluateMeetupProposalDurationWarning } from '@/lib/rentalDurationValidation';
import { persistMeetupProposalRow, type MeetupProposalPersistPhase } from '@/lib/rentalMeetupPersist';
import { isUuidString } from '@/lib/requestOwnership';
import { clearWizardCoordinateDraftsForRental } from '@/lib/rentalWizard/rentalWizardSeenState';
import type { RentalWizardRentalRow } from '@/lib/rentalWizard/types';

export type SubmitRentalMeetupProposalInput = {
  meetupTimeIso: string;
  returnTimeIso: string;
  meetupLocation: string;
  /** When set, only return location changes; pickup location stays on `meetupLocation`. */
  returnLocation?: string;
  /** Optional scheduling metadata for future delivery/insurance negotiation. */
  proposalMeta?: Record<string, unknown>;
};

export type SubmitRentalMeetupProposalResult =
  | { ok: true }
  | { ok: false; reason: 'validation' | 'update' | 'message' | 'cancelled' };

export async function submitRentalMeetupProposal(
  supabase: SupabaseClient,
  rental: RentalWizardRentalRow,
  viewerUserId: string,
  input: SubmitRentalMeetupProposalInput,
  options?: {
    requestSchedulingMeta?: unknown;
    scheduleHints?: {
      rentalStartDate?: string | null;
      rentalEndDate?: string | null;
    } | null;
    rentalTitle?: string;
    skipDurationAlert?: boolean;
  }
): Promise<SubmitRentalMeetupProposalResult> {
  const meetupTimeIso = input.meetupTimeIso.trim();
  const returnTimeIso = input.returnTimeIso.trim();
  const meetupLocation = input.meetupLocation.trim();
  const returnLocation = (input.returnLocation ?? meetupLocation).trim();
  const isReturnOnly = input.proposalMeta?.phase === 'return';
  const isPickupOnly = input.proposalMeta?.phase === 'pickup';
  const isExtension = input.proposalMeta?.extension === true;
  const persistPhase: MeetupProposalPersistPhase = isExtension
    ? 'extension'
    : isReturnOnly
      ? 'return'
      : isPickupOnly
        ? 'pickup'
        : 'general';
  if (!meetupTimeIso || !returnTimeIso || !meetupLocation || !returnLocation) {
    return { ok: false, reason: 'validation' };
  }

  const durationEval = evaluateMeetupProposalDurationWarning({
    rental,
    requestSchedulingMeta: options?.requestSchedulingMeta,
    scheduleHints: options?.scheduleHints,
    meetupTimeIso,
    returnTimeIso,
    isReturnOnly,
    isExtension: input.proposalMeta?.extension === true,
    proposalMeta: input.proposalMeta,
  });

  if (durationEval.warningTriggered && !options?.skipDurationAlert) {
    const continueProposal = await new Promise<boolean>((resolve) => {
      Alert.alert(
        durationEval.isExtensionRequest ? 'Extension request' : 'Outside rental dates',
        durationEval.warningLine ??
          'You are proposing times outside the agreed rental dates. The other party must approve this change.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Continue Proposal', onPress: () => resolve(true) },
        ]
      );
    });
    if (!continueProposal) return { ok: false, reason: 'cancelled' };
  }

  const iAmOwner = rental.owner_user_id === viewerUserId;
  const iAmRenter = rental.renter_user_id === viewerUserId;
  const nowIso = new Date().toISOString();
  const nextProposalVersion =
    typeof rental.proposal_version === 'number' && Number.isFinite(rental.proposal_version)
      ? rental.proposal_version + 1
      : 2;

  const persistResult = await persistMeetupProposalRow(
    supabase,
    rental.id,
    {
      meetupTimeIso,
      returnTimeIso,
      meetupLocation,
      returnLocation,
      viewerUserId,
      ownerUserId: rental.owner_user_id,
      renterUserId: rental.renter_user_id,
      proposalVersion: nextProposalVersion,
      nowIso,
    },
    { phase: persistPhase, source: 'submitRentalMeetupProposal', baseline: rental }
  );
  if (!persistResult.ok) {
    Alert.alert('Could not save proposal', 'Please try again.');
    return { ok: false, reason: 'update' };
  }

  const hasCol = (k: string) => Object.prototype.hasOwnProperty.call(rental, k);

  const receiverId = iAmOwner ? rental.renter_user_id : rental.owner_user_id;
  const requestRowId =
    rental.request_id != null && isUuidString(String(rental.request_id))
      ? String(rental.request_id)
      : null;
  const offerId =
    rental.offer_id != null && isUuidString(String(rental.offer_id)) ? String(rental.offer_id) : null;

  let messageId: string | null = null;
  if (offerId && receiverId && receiverId !== viewerUserId) {
    messageId = await insertMeetupProposalOfferMessage({
      offerId,
      requestRowId,
      rentalId: rental.id,
      authorId: viewerUserId,
      receiverId,
      meetupTimeIso,
      returnTimeIso,
      meetupLocation,
      returnLocation,
      durationWarningLine: durationEval.warningLine,
      isReturnOnly,
      isExtension: durationEval.isExtensionRequest,
      proposalPhase: isPickupOnly ? 'pickup' : isReturnOnly ? 'return' : isExtension ? 'extension' : 'general',
      proposerUserId: viewerUserId,
    });
    if (!messageId) {
      Alert.alert('Could not post proposal', 'Chat proposal message could not be created.');
      return { ok: false, reason: 'message' };
    }
    insertServerNotificationToRecipient({
      actorId: viewerUserId,
      recipientUserId: receiverId,
      type: 'message',
      title: durationEval.isExtensionRequest
        ? `${getProfileNameForUserId(viewerUserId)} requested a rental extension`
        : durationEval.warningTriggered
          ? `${getProfileNameForUserId(viewerUserId)} proposed meetup times outside the rental dates`
        : isReturnOnly
          ? `${getProfileNameForUserId(viewerUserId)} proposed return details`
          : isPickupOnly
            ? `${getProfileNameForUserId(viewerUserId)} proposed pickup details`
            : `${getProfileNameForUserId(viewerUserId)} proposed a pickup time`,
      body: (() => {
        const title = String(options?.rentalTitle ?? '').trim();
        if (isReturnOnly) {
          return title ? `Return time or location change for ${title}` : 'Return details were proposed.';
        }
        if (isPickupOnly) {
          return title ? `Pickup proposal for ${title}` : 'Pickup details were proposed.';
        }
        return title ? `New meetup proposal for ${title}` : 'A meetup time was proposed.';
      })(),
      offerId,
      requestId: requestRowId,
      rentalId: rental.id,
    });
    void insertMeetupCoordinationTimelineForRental({
      rental,
      authorId: viewerUserId,
      event: isExtension
        ? 'extension_requested'
        : isReturnOnly
          ? 'return_proposed'
          : isPickupOnly
            ? 'pickup_proposed'
            : 'pickup_proposed',
      pickupIso: meetupTimeIso,
      returnIso: returnTimeIso,
      location: meetupLocation,
    });
  }

  if (messageId && hasCol('latest_proposal_message_id')) {
    await supabase.from('rentals').update({ latest_proposal_message_id: messageId }).eq('id', rental.id);
  }

  await clearWizardCoordinateDraftsForRental(supabase, rental.id);

  return { ok: true };
}
