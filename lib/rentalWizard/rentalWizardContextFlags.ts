import {
  isPickupCoordinationCompleteFromRow,
  isReturnCoordinationCompleteFromRow,
} from '@/lib/rentalOwnerWorkspacePhase';
import type { RentalWizardRentalRow } from '@/lib/rentalWizard/types';

export function buildRentalWizardContextFlags(rental: RentalWizardRentalRow) {
  const ownerConfirmed =
    typeof rental.owner_confirmed === 'boolean'
      ? rental.owner_confirmed
      : Boolean(rental.confirmed_by_owner);
  const renterConfirmed =
    typeof rental.renter_confirmed === 'boolean'
      ? rental.renter_confirmed
      : Boolean(rental.confirmed_by_renter);
  const agreementStatus =
    rental.agreement_status === 'confirmed'
      ? 'confirmed'
      : rental.agreement_status === 'pending'
        ? 'pending'
        : ownerConfirmed && renterConfirmed
          ? 'confirmed'
          : 'pending';
  const hasPendingProposal =
    agreementStatus === 'pending' && String(rental.last_proposed_by ?? '').trim().length > 0;
  const pickupCoordinationComplete = isPickupCoordinationCompleteFromRow(rental);
  const returnCoordinationAgreed = isReturnCoordinationCompleteFromRow(rental);
  const meetupCoordinationComplete =
    pickupCoordinationComplete && returnCoordinationAgreed;
  /** Global pending layer cleared (e.g. after pickup-only accept) — not full meetup bilateral. */
  const meetingAgreementCleared = agreementStatus === 'confirmed' && !hasPendingProposal;
  /** Full bilateral meetup coordination — drives wizard/workspace progression. */
  const meetingCompleted = meetupCoordinationComplete;
  return {
    agreementStatus,
    hasPendingProposal,
    meetingCompleted,
    meetingAgreementCleared,
    pickupCoordinationComplete,
    returnCoordinationAgreed,
    meetupCoordinationComplete,
  };
}
