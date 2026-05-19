import { Alert } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getProfileNameForUserId } from '@/lib/profileDisplayName';
import { insertMeetupProposalOfferMessage } from '@/lib/meetupProposalThreadEvent';
import { insertServerNotificationToRecipient } from '@/lib/insertServerNotification';
import { evaluateMeetupProposalDurationWarning } from '@/lib/rentalDurationValidation';
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
    rentalTitle?: string;
    skipDurationAlert?: boolean;
  }
): Promise<SubmitRentalMeetupProposalResult> {
  const meetupTimeIso = input.meetupTimeIso.trim();
  const returnTimeIso = input.returnTimeIso.trim();
  const meetupLocation = input.meetupLocation.trim();
  const returnLocation = (input.returnLocation ?? meetupLocation).trim();
  const isReturnOnly = input.proposalMeta?.phase === 'return';
  if (!meetupTimeIso || !returnTimeIso || !meetupLocation || !returnLocation) {
    return { ok: false, reason: 'validation' };
  }

  const durationEval = evaluateMeetupProposalDurationWarning({
    rental,
    requestSchedulingMeta: options?.requestSchedulingMeta,
    meetupTimeIso,
    returnTimeIso,
    isReturnOnly,
    isExtension: input.proposalMeta?.extension === true,
    proposalMeta: input.proposalMeta,
  });

  if (durationEval.warningTriggered && !options?.skipDurationAlert) {
    const continueProposal = await new Promise<boolean>((resolve) => {
      Alert.alert(
        'Duration change',
        [
          'You are proposing a rental duration different from the original agreement.',
          '',
          `Original duration: ${durationEval.originalLabel ?? '—'}`,
          `Proposed duration: ${durationEval.proposedLabel ?? '—'}`,
          '',
          'The other party must approve this change. Pricing and rental terms may change based on the updated duration.',
        ].join('\n'),
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
  const hasCol = (k: string) => Object.prototype.hasOwnProperty.call(rental, k);
  const payload: Record<string, unknown> = {
    meetup_time: meetupTimeIso,
    meetup_location: meetupLocation,
    return_time: returnTimeIso,
    return_location: returnLocation,
    confirmed_by_owner: iAmOwner ? true : false,
    confirmed_by_renter: iAmRenter ? true : false,
  };
  if (hasCol('pickup_datetime')) payload.pickup_datetime = meetupTimeIso;
  if (hasCol('return_datetime')) payload.return_datetime = returnTimeIso;
  if (hasCol('owner_confirmed')) payload.owner_confirmed = iAmOwner ? true : false;
  if (hasCol('renter_confirmed')) payload.renter_confirmed = iAmRenter ? true : false;
  if (hasCol('agreement_status')) payload.agreement_status = 'pending';
  if (hasCol('confirmed_at')) payload.confirmed_at = null;
  if (hasCol('last_proposed_by')) payload.last_proposed_by = viewerUserId;
  if (hasCol('proposal_version')) payload.proposal_version = nextProposalVersion;
  if (hasCol('proposal_updated_at')) payload.proposal_updated_at = nowIso;
  if (hasCol('latest_proposal_message_id')) payload.latest_proposal_message_id = null;

  const { error: updateError } = await supabase.from('rentals').update(payload).eq('id', rental.id);
  if (updateError) {
    Alert.alert('Could not save proposal', 'Please try again.');
    return { ok: false, reason: 'update' };
  }

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
    });
    if (!messageId) {
      Alert.alert('Could not post proposal', 'Chat proposal message could not be created.');
      return { ok: false, reason: 'message' };
    }
    insertServerNotificationToRecipient({
      actorId: viewerUserId,
      recipientUserId: receiverId,
      type: 'message',
      title: durationEval.warningTriggered
        ? `${getProfileNameForUserId(viewerUserId)} proposed updated meetup times with a changed rental duration`
        : isReturnOnly
          ? `${getProfileNameForUserId(viewerUserId)} proposed return details`
          : `${getProfileNameForUserId(viewerUserId)} proposed a pickup time`,
      body: (() => {
        const title = String(options?.rentalTitle ?? '').trim();
        if (isReturnOnly) {
          return title ? `Return time or location change for ${title}` : 'Return details were proposed.';
        }
        return title ? `New meetup proposal for ${title}` : 'A meetup time was proposed.';
      })(),
      offerId,
      requestId: requestRowId,
      rentalId: rental.id,
    });
  }

  if (messageId && hasCol('latest_proposal_message_id')) {
    await supabase.from('rentals').update({ latest_proposal_message_id: messageId }).eq('id', rental.id);
  }

  await clearWizardCoordinateDraftsForRental(supabase, rental.id);

  return { ok: true };
}
