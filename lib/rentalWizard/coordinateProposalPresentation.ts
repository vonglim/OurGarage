import type { RentalWizardContext } from '@/lib/rentalWizard/types';
import { resolveCounterpartyProposalChangeFlags } from '@/lib/rentalWizard/coordinateProposalFieldDiff';

export type CoordinateProposalPhase = 'pickup' | 'return';

export function counterpartyRoleForViewer(ctx: RentalWizardContext): 'owner' | 'renter' {
  return ctx.viewerRole === 'owner' ? 'renter' : 'owner';
}

export function counterpartyLabelForViewer(ctx: RentalWizardContext): 'The owner' | 'The renter' {
  return ctx.viewerRole === 'owner' ? 'The renter' : 'The owner';
}

export function newProposalHeadline(phase: CoordinateProposalPhase): string {
  return phase === 'pickup' ? 'New pickup proposal' : 'New return proposal';
}

export function coordinateLocationCardTitle(input: {
  phase: CoordinateProposalPhase;
  coordinationFinalized: boolean;
  reviewingCounterpartyProposal: boolean;
  counterpartyRole: 'owner' | 'renter';
  waitingOnCounterparty?: boolean;
}): string {
  if (input.coordinationFinalized) return 'Confirmed location';
  if (input.reviewingCounterpartyProposal) {
    return input.counterpartyRole === 'renter'
      ? "Renter's proposed location"
      : "Owner's proposed location";
  }
  if (input.waitingOnCounterparty) return 'Your proposed location';
  return input.phase === 'pickup' ? 'Pickup location' : 'Return location';
}

export function coordinateScheduleFieldTitle(input: {
  phase: CoordinateProposalPhase;
  coordinationFinalized: boolean;
  reviewingCounterpartyProposal: boolean;
  counterpartyRole: 'owner' | 'renter';
  waitingOnCounterparty?: boolean;
  editing?: boolean;
}): string {
  if (input.coordinationFinalized) return 'Confirmed time';
  if (input.reviewingCounterpartyProposal) {
    return input.counterpartyRole === 'renter'
      ? "Renter's proposed time"
      : "Owner's proposed time";
  }
  if (input.waitingOnCounterparty) return 'Your proposed time';
  if (input.editing) {
    return input.phase === 'pickup' ? 'Choose a pickup time' : 'Choose a return time';
  }
  return input.phase === 'pickup' ? 'Proposed pickup time' : 'Proposed return time';
}

export function proposalBannerDetails(input: {
  ctx: RentalWizardContext;
  phase: CoordinateProposalPhase;
}): {
  headline: string;
  summaryLine: string;
} {
  const { ctx, phase } = input;
  const counterparty = counterpartyLabelForViewer(ctx);
  const phaseLabel = phase === 'pickup' ? 'pickup' : 'return';
  const laneState = phase === 'pickup' ? ctx.meetupCoordination.pickup : ctx.meetupCoordination.return;
  const { locationChanged, timeChanged, confirmOnly } = resolveCounterpartyProposalChangeFlags({
    phase,
    lane: laneState,
    ctx,
  });

  if (confirmOnly) {
    return {
      headline: phase === 'pickup' ? 'Pickup details to confirm' : 'Return details to confirm',
      summaryLine: `${counterparty} confirmed the ${phaseLabel} location and time. Review below and confirm.`,
    };
  }

  if (!locationChanged && !timeChanged) {
    return {
      headline: newProposalHeadline(phase),
      summaryLine: `${counterparty} sent ${phaseLabel} details to review.`,
    };
  }

  return {
    headline: newProposalHeadline(phase),
    summaryLine: `${counterparty} suggested updated ${phaseLabel} details.`,
  };
}
