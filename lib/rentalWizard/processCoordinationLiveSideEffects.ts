import type { CoordinationLiveBannerState } from '@/lib/rentalWizard/coordinationLiveBanner';
import {
  detectCoordinationAcceptanceArming,
  detectCoordinationLiveBannerEvent,
} from '@/lib/rentalWizard/coordinationLiveBanner';
import { logCoordinationBanner } from '@/lib/rentalWizard/coordinationInstrumentation';
import {
  logCoordinationReviewState,
  resolvePickupCoordinateReviewState,
} from '@/lib/rentalWizard/coordinatePickupReviewState';
import type { WizardLifecyclePromptId } from '@/lib/rentalWizard/wizardLifecyclePromptGate';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';

export function processCoordinationLiveSideEffects(input: {
  prev: RentalWizardContext;
  next: RentalWizardContext;
  viewerUserId: string;
  rentalId: string;
  pathname: string;
  triggerSource: string;
  armLifecyclePrompt: (id: WizardLifecyclePromptId) => void;
  showBanner: (banner: CoordinationLiveBannerState) => void;
}): void {
  const acceptance = detectCoordinationAcceptanceArming({
    prev: input.prev,
    next: input.next,
    viewerUserId: input.viewerUserId,
    pathname: input.pathname,
  });
  if (acceptance === 'pickup_coordination_accepted') {
    logCoordinationBanner({
      event: 'acceptance_armed',
      rentalId: input.rentalId,
      lane: 'pickup',
      kind: 'pickup_confirmed',
      recipient: input.viewerUserId,
      proposalCreator: String(input.next.rental.last_proposed_by ?? '').trim() || null,
      proposal_version: input.next.rental.proposal_version ?? null,
      bannerShown: false,
      triggerSource: input.triggerSource,
    });
    input.armLifecyclePrompt('pickup_coordination_accepted');
    return;
  }
  if (acceptance === 'return_coordination_confirm_requested') {
    logCoordinationBanner({
      event: 'confirm_request_armed',
      rentalId: input.rentalId,
      lane: 'return',
      kind: 'return_proposal_received',
      recipient: input.viewerUserId,
      proposalCreator: String(input.next.rental.last_proposed_by ?? '').trim() || null,
      proposal_version: input.next.rental.proposal_version ?? null,
      bannerShown: false,
      triggerSource: input.triggerSource,
    });
    input.armLifecyclePrompt('return_coordination_confirm_requested');
    return;
  }
  if (acceptance === 'return_coordination_accepted') {
    logCoordinationBanner({
      event: 'acceptance_armed',
      rentalId: input.rentalId,
      lane: 'return',
      kind: 'return_confirmed',
      recipient: input.viewerUserId,
      proposalCreator: String(input.next.rental.last_proposed_by ?? '').trim() || null,
      proposal_version: input.next.rental.proposal_version ?? null,
      bannerShown: false,
      triggerSource: input.triggerSource,
    });
    input.armLifecyclePrompt('return_coordination_accepted');
    return;
  }

  const banner = detectCoordinationLiveBannerEvent({
    prev: input.prev,
    next: input.next,
    viewerUserId: input.viewerUserId,
    rentalId: input.rentalId,
    pathname: input.pathname,
    triggerSource: input.triggerSource,
  });
  if (banner) {
    const pickupReview = resolvePickupCoordinateReviewState({
      lane: input.next.meetupCoordination.pickup,
      lastProposedBy: input.next.rental.last_proposed_by,
      suggestingChanges: false,
    });
    logCoordinationReviewState('realtime_banner_side_effect', input.rentalId, {
      review: pickupReview,
      suggestingChanges: false,
      proposalVersion:
        typeof input.next.rental.proposal_version === 'number'
          ? input.next.rental.proposal_version
          : null,
      displayedLocation: pickupReview.laneLocation,
      displayedTimeIso: pickupReview.laneDateTimeIso,
      currentCTAState: pickupReview.reviewingCounterpartyProposal
        ? 'accept_proposal'
        : pickupReview.waitingOnCounterparty
          ? 'waiting_for_renter'
          : 'propose',
      reviewingRenterProposal: pickupReview.reviewingCounterpartyProposal,
    });
    input.showBanner(banner);
  }
}
