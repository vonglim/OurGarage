import type { MeetupPhaseCoordinationLane } from '@/lib/rentalMeetupPhaseCoordinationState';

export type PickupCoordinateReviewState = {
  /** Counterparty sent a proposal this phase — viewer should review, not edit own draft. */
  reviewingCounterpartyProposal: boolean;
  /** Viewer sent the pending proposal and is waiting. */
  waitingOnCounterparty: boolean;
  /** Lane says viewer can accept the pending proposal. */
  viewerCanAccept: boolean;
  proposedByRole: 'owner' | 'renter' | null;
  lastProposedBy: string | null;
  laneLocation: string;
  laneDateTimeIso: string | null;
};

/**
 * Return wizard UI finalization — uses lane state, not row-only `agreed_return_datetime`.
 * Stays false while a pending return proposal is active even after a prior direct confirm.
 */
export function isReturnCoordinationFinalizedForWizard(
  lane: MeetupPhaseCoordinationLane
): boolean {
  return lane.coordinationComplete;
}

export function resolvePickupCoordinateReviewState(input: {
  lane: MeetupPhaseCoordinationLane;
  lastProposedBy?: string | null;
  suggestingChanges: boolean;
}): PickupCoordinateReviewState {
  const lane = input.lane;
  const viewerCanAccept = lane.isPendingThisPhase && lane.viewerCanAccept;
  const waitingOnCounterparty = lane.isPendingThisPhase && lane.viewerIsProposer;
  const reviewingCounterpartyProposal = viewerCanAccept && !input.suggestingChanges;

  return {
    reviewingCounterpartyProposal,
    waitingOnCounterparty,
    viewerCanAccept,
    proposedByRole: lane.proposedByRole,
    lastProposedBy:
      String(input.lastProposedBy ?? lane.proposedBy ?? '').trim() || null,
    laneLocation: lane.location,
    laneDateTimeIso: lane.dateTimeIso,
  };
}

export function logCoordinationReviewState(
  surface: string,
  rentalId: string,
  input: {
    review: PickupCoordinateReviewState;
    suggestingChanges: boolean;
    proposalVersion: number | null;
    displayedLocation: string;
    displayedTimeIso: string | null;
    currentCTAState: string;
    reviewingOwnerProposal?: boolean;
    reviewingRenterProposal?: boolean;
  }
): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  console.log('[coordination-review-state]', {
    ts: new Date().toISOString(),
    surface,
    rentalId,
    proposedByRole: input.review.proposedByRole,
    last_proposed_by: input.review.lastProposedBy,
    proposal_version: input.proposalVersion,
    reviewingOwnerProposal: input.reviewingOwnerProposal ?? null,
    reviewingRenterProposal: input.reviewingRenterProposal ?? null,
    reviewingCounterpartyProposal: input.review.reviewingCounterpartyProposal,
    waitingOnCounterparty: input.review.waitingOnCounterparty,
    viewerCanAccept: input.review.viewerCanAccept,
    displayedLocation: input.displayedLocation,
    displayedTime: input.displayedTimeIso,
    currentCTAState: input.currentCTAState,
    suggestingChanges: input.suggestingChanges,
    laneLocation: input.review.laneLocation,
    laneDateTimeIso: input.review.laneDateTimeIso,
  });
}
