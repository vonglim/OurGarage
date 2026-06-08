import type { CoordinationMeetupLane } from '@/lib/rentalWizard/coordinationInstrumentation';
import { logCoordinationBanner } from '@/lib/rentalWizard/coordinationInstrumentation';
import {
  buildCoordinationSnapshot,
  buildReturnCoordinationSnapshot,
  evaluatePickupCoordinationAcceptedPrompt,
  evaluateReturnCoordinationAcceptedPrompt,
} from '@/lib/rentalWizard/wizardLifecyclePromptDetection';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';

export type CoordinationLiveBannerKind =
  | 'pickup_proposal_received'
  | 'return_proposal_received'
  | 'pickup_confirmed'
  | 'return_confirmed';

export type CoordinationLiveBannerState = {
  id: string;
  kind: CoordinationLiveBannerKind;
  lane: CoordinationMeetupLane;
  headline: string;
  actionLabel: string | null;
  proposalCreator: string | null;
  proposalVersion: number | null;
};

export function headlineForCoordinationBanner(kind: CoordinationLiveBannerKind): string {
  switch (kind) {
    case 'pickup_proposal_received':
      return 'Pickup proposal received';
    case 'return_proposal_received':
      return 'Return proposal received';
    case 'pickup_confirmed':
      return 'Pickup details confirmed';
    case 'return_confirmed':
      return 'Return details confirmed';
    default:
      return 'Coordination update';
  }
}

function isOnCoordinatePickupPath(pathname: string): boolean {
  return pathname.includes('/s/coordinate-pickup') || pathname.includes('/coordinate-pickup');
}

function isOnCoordinateReturnPath(pathname: string): boolean {
  return pathname.includes('/s/coordinate-return') || pathname.includes('/coordinate-return');
}

function counterpartyProposedLane(
  prev: RentalWizardContext,
  next: RentalWizardContext,
  lane: CoordinationMeetupLane
): boolean {
  const laneState = lane === 'pickup' ? next.meetupCoordination.pickup : next.meetupCoordination.return;
  const prevLane =
    lane === 'pickup' ? prev.meetupCoordination.pickup : prev.meetupCoordination.return;
  if (!laneState.isPendingThisPhase || !laneState.viewerCanAccept) return false;
  const revisionBumped = next.meetupCoordination.revision > prev.meetupCoordination.revision;
  const becamePending = !prevLane.isPendingThisPhase && laneState.isPendingThisPhase;
  const proposerChanged =
    String(prev.rental.last_proposed_by ?? '').trim() !==
    String(next.rental.last_proposed_by ?? '').trim();
  return revisionBumped || becamePending || proposerChanged;
}

export function detectCoordinationAcceptanceArming(input: {
  prev: RentalWizardContext;
  next: RentalWizardContext;
  viewerUserId: string;
  pathname: string;
}): 'pickup_coordination_accepted' | 'return_coordination_accepted' | null {
  const me = input.viewerUserId.trim();
  if (isOnCoordinatePickupPath(input.pathname)) {
    const pickupEval = evaluatePickupCoordinationAcceptedPrompt(
      buildCoordinationSnapshot(input.prev),
      buildCoordinationSnapshot(input.next),
      me
    );
    if (pickupEval.show) return 'pickup_coordination_accepted';
  }
  if (isOnCoordinateReturnPath(input.pathname)) {
    const returnEval = evaluateReturnCoordinationAcceptedPrompt(
      buildReturnCoordinationSnapshot(input.prev),
      buildReturnCoordinationSnapshot(input.next),
      me
    );
    if (returnEval.show) return 'return_coordination_accepted';
  }
  return null;
}

export function detectCoordinationLiveBannerEvent(input: {
  prev: RentalWizardContext;
  next: RentalWizardContext;
  viewerUserId: string;
  rentalId: string;
  pathname: string;
  triggerSource: string;
}): CoordinationLiveBannerState | null {
  const { prev, next, viewerUserId, rentalId, pathname, triggerSource } = input;
  const me = viewerUserId.trim();
  const proposalCreator = String(next.rental.last_proposed_by ?? '').trim() || null;
  const proposalVersion =
    typeof next.rental.proposal_version === 'number' ? next.rental.proposal_version : null;

  if (isOnCoordinatePickupPath(pathname)) {
    if (counterpartyProposedLane(prev, next, 'pickup')) {
      const kind: CoordinationLiveBannerKind = 'pickup_proposal_received';
      const banner: CoordinationLiveBannerState = {
        id: `${kind}-${next.meetupCoordination.revision}`,
        kind,
        lane: 'pickup',
        headline: headlineForCoordinationBanner(kind),
        actionLabel: 'Review now',
        proposalCreator,
        proposalVersion,
      };
      logCoordinationBanner({
        event: 'shown',
        source: 'realtime',
        triggerSource,
        rentalId,
        recipient: me,
        proposalCreator,
        proposal_version: proposalVersion,
        lane: 'pickup',
        kind,
        bannerShown: true,
      });
      return banner;
    }
  }

  if (isOnCoordinateReturnPath(pathname)) {
    if (counterpartyProposedLane(prev, next, 'return')) {
      const kind: CoordinationLiveBannerKind = 'return_proposal_received';
      const banner: CoordinationLiveBannerState = {
        id: `${kind}-${next.meetupCoordination.revision}`,
        kind,
        lane: 'return',
        headline: headlineForCoordinationBanner(kind),
        actionLabel: 'Review now',
        proposalCreator,
        proposalVersion,
      };
      logCoordinationBanner({
        event: 'shown',
        source: 'realtime',
        triggerSource,
        rentalId,
        recipient: me,
        proposalCreator,
        proposal_version: proposalVersion,
        lane: 'return',
        kind,
        bannerShown: true,
      });
      return banner;
    }
  }

  return null;
}

export function coordinationBannerFromNotification(input: {
  kind: CoordinationLiveBannerKind;
  rentalId: string;
  recipientUserId: string;
  proposalCreator?: string | null;
  proposalVersion?: number | null;
}): CoordinationLiveBannerState {
  const banner: CoordinationLiveBannerState = {
    id: `${input.kind}-${Date.now()}`,
    kind: input.kind,
    lane: input.kind.startsWith('return') ? 'return' : 'pickup',
    headline: headlineForCoordinationBanner(input.kind),
    actionLabel:
      input.kind === 'pickup_proposal_received' || input.kind === 'return_proposal_received'
        ? 'Review now'
        : null,
    proposalCreator: input.proposalCreator ?? null,
    proposalVersion: input.proposalVersion ?? null,
  };
  logCoordinationBanner({
    event: 'shown',
    source: 'notification',
    rentalId: input.rentalId,
    recipient: input.recipientUserId,
    proposalCreator: input.proposalCreator ?? null,
    proposal_version: input.proposalVersion ?? null,
    lane: banner.lane,
    kind: input.kind,
    bannerShown: true,
  });
  return banner;
}
