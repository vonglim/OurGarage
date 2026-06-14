import { snapDateTimeToQuarterHour } from '@/lib/dateTimeScheduling';
import {
  resolveAcceptedMeetupLocation,
  resolveAcceptedRentalPickupIso,
} from '@/lib/rentalWizard/acceptedPickupCoordination';
import { resolveOperationalPickupIso } from '@/lib/rentalWizard/proposedMeetupSchedule';
import { resolveProposalReturnIsoForPickup } from '@/lib/rentalWizard/wizardMeetupDraft';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';
import { getEffectiveNowMs } from '@/lib/rentalSimulation/simulationClock';

export type MeetupDayPickupProposalState = {
  pending: boolean;
  acceptedPickupIso: string | null;
  pendingPickupIso: string | null;
  viewerCanAccept: boolean;
  viewerIsProposer: boolean;
};

/** Pickup handoff still in progress — authorization milestones do not block late extensions. */
export function canRequestMeetupDayPickupExtension(ctx: RentalWizardContext): boolean {
  if (!ctx.meetupCoordinationComplete) return false;
  if (ctx.pickupHandoffComplete) return false;
  if (ctx.meetupCoordination.pickup.isPendingThisPhase) return false;
  return true;
}

export function resolveMeetupDayPickupProposalState(
  ctx: RentalWizardContext
): MeetupDayPickupProposalState {
  const lane = ctx.meetupCoordination.pickup;
  const pending = lane.isPendingThisPhase;
  return {
    pending,
    acceptedPickupIso: resolveAcceptedRentalPickupIso(ctx.rental),
    pendingPickupIso: pending ? resolveOperationalPickupIso(ctx.rental) : null,
    viewerCanAccept: lane.viewerCanAccept,
    viewerIsProposer: lane.viewerIsProposer,
  };
}

export function computePickupExtensionIso(
  baselinePickupIso: string,
  minutesToAdd: number,
  nowMs: number = getEffectiveNowMs()
): string {
  const baselineMs = Date.parse(baselinePickupIso);
  const anchorMs = Math.max(nowMs, Number.isFinite(baselineMs) ? baselineMs : nowMs);
  return snapDateTimeToQuarterHour(new Date(anchorMs + minutesToAdd * 60_000)).toISOString();
}

export function buildMeetupDayPickupExtensionProposalInput(
  ctx: RentalWizardContext,
  newPickupIso: string
): {
  meetupTimeIso: string;
  returnTimeIso: string;
  meetupLocation: string;
} | null {
  const meetupLocation = resolveAcceptedMeetupLocation(ctx.rental);
  const meetupTimeIso = newPickupIso.trim();
  if (!meetupTimeIso || !meetupLocation) return null;
  const returnTimeIso = resolveProposalReturnIsoForPickup(ctx, meetupTimeIso);
  return { meetupTimeIso, returnTimeIso, meetupLocation };
}
