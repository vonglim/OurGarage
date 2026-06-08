import type { RentalWizardContext } from '@/lib/rentalWizard/types';
import type { CoordinationMeetupLane } from '@/lib/rentalWizard/coordinationInstrumentation';

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
  lane: CoordinationMeetupLane;
}): {
  headline: string;
  summaryLine: string;
} {
  const phase: CoordinateProposalPhase = input.lane;
  const counterparty = counterpartyLabelForViewer(input.ctx);
  const phaseLabel = phase === 'pickup' ? 'pickup' : 'return';

  return {
    headline: newProposalHeadline(phase),
    summaryLine: `${counterparty} suggested updated ${phaseLabel} details.`,
  };
}
