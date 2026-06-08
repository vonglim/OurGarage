import type { MeetupPhaseCoordinationLane } from '@/lib/rentalMeetupPhaseCoordinationState';
import { buildAcceptedPickupCoordination } from '@/lib/rentalWizard/acceptedPickupCoordination';
import { buildInheritedReturnDefaults } from '@/lib/rentalWizard/resolveReturnMeetupDefaults';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';
import {
  readViewerLastMeetupSubmission,
  type CoordinateMeetupPhase,
} from '@/lib/rentalWizard/wizardMeetupDraft';

export type { CoordinateMeetupPhase };

export type MeetupBaselineSource =
  | 'viewer_last_submission'
  | 'mutually_accepted_pickup'
  | 'mutually_accepted_return'
  | 'none';

export type MeetupBaselineTimeSource =
  | 'viewer_last_submission'
  | 'mutually_accepted_pickup'
  | 'mutually_accepted_return'
  | 'none';

export type CoordinateProposalFieldDiffTrace = {
  phase: CoordinateMeetupPhase;
  baselineLocation: string;
  baselineTime: string | null;
  baselineSource: MeetupBaselineSource;
  baselineTimeSource: MeetupBaselineTimeSource;
  incomingLocation: string;
  incomingTime: string | null;
  locationChanged: boolean;
  timeChanged: boolean;
  proposalVersion: number | null;
  lastProposedBy: string | null;
  viewerRole: RentalWizardContext['viewerRole'];
};

function parseMeetupIso(raw: string | null | undefined): string | null {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s || !Number.isFinite(Date.parse(s))) return null;
  return s;
}

export function meetupLocationsEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function meetupTimesEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const as = parseMeetupIso(a);
  const bs = parseMeetupIso(b);
  if (!as && !bs) return true;
  if (!as || !bs) return false;
  return Math.floor(Date.parse(as) / 60_000) === Math.floor(Date.parse(bs) / 60_000);
}

function resolveMutuallyAcceptedPickupBaseline(ctx: RentalWizardContext): {
  location: string;
  timeIso: string | null;
  source: MeetupBaselineSource;
  timeSource: MeetupBaselineTimeSource;
} {
  if (ctx.pickupCoordinationComplete) {
    const accepted = buildAcceptedPickupCoordination(ctx);
    return {
      location: accepted.location,
      timeIso: parseMeetupIso(accepted.meetupTimeIso),
      source: 'mutually_accepted_pickup',
      timeSource: 'mutually_accepted_pickup',
    };
  }

  return {
    location: '',
    timeIso: parseMeetupIso(ctx.rental.agreed_pickup_datetime),
    source: 'mutually_accepted_pickup',
    timeSource: parseMeetupIso(ctx.rental.agreed_pickup_datetime)
      ? 'mutually_accepted_pickup'
      : 'none',
  };
}

function resolveReturnMeetupLocationBaseline(ctx: RentalWizardContext): string {
  const inherited = buildInheritedReturnDefaults(ctx);
  const fromRental = (ctx.rental.return_location ?? ctx.rental.meetup_location ?? '').trim();
  return fromRental || inherited.location;
}

function resolveMutuallyAcceptedReturnBaseline(ctx: RentalWizardContext): {
  location: string;
  timeIso: string | null;
  source: MeetupBaselineSource;
  timeSource: MeetupBaselineTimeSource;
} {
  const location = resolveReturnMeetupLocationBaseline(ctx);

  if (ctx.returnCoordinationAgreed) {
    const timeIso = parseMeetupIso(ctx.rental.agreed_return_datetime);
    return {
      location,
      timeIso,
      source: 'mutually_accepted_return',
      timeSource: timeIso ? 'mutually_accepted_return' : 'none',
    };
  }

  const inherited = buildInheritedReturnDefaults(ctx);
  const timeIso =
    parseMeetupIso(ctx.rental.agreed_return_datetime) ??
    parseMeetupIso(inherited.meetupTimeIso);
  return {
    location,
    timeIso,
    source: 'mutually_accepted_return',
    timeSource: timeIso ? 'mutually_accepted_return' : 'none',
  };
}

/**
 * Baseline for field diffs while reviewing a counterparty proposal.
 * Uses the viewer's last submitted proposal, or last mutually accepted values only.
 */
export function resolveViewerMeetupBaselineForDiff(input: {
  phase: CoordinateMeetupPhase;
  ctx: RentalWizardContext;
}): {
  location: string;
  timeIso: string | null;
  source: MeetupBaselineSource;
  timeSource: MeetupBaselineTimeSource;
} {
  const { phase, ctx } = input;
  const mutual =
    phase === 'pickup'
      ? resolveMutuallyAcceptedPickupBaseline(ctx)
      : resolveMutuallyAcceptedReturnBaseline(ctx);

  const viewerLast = readViewerLastMeetupSubmission(ctx.wizardProgress, phase);
  if (viewerLast) {
    const viewerTimeIso = parseMeetupIso(viewerLast.meetupTimeIso);
    const viewerLocation = viewerLast.location.trim();
    const location =
      phase === 'return'
        ? viewerLocation || mutual.location
        : viewerLocation;
    return {
      location,
      timeIso: viewerTimeIso ?? mutual.timeIso,
      source: 'viewer_last_submission',
      timeSource: viewerTimeIso ? 'viewer_last_submission' : mutual.timeSource,
    };
  }

  return {
    location: mutual.location,
    timeIso: mutual.timeIso,
    source: mutual.source,
    timeSource: mutual.timeSource,
  };
}

/** Incoming counterparty proposal values for the active coordination lane. */
export function resolveIncomingMeetupProposalValues(lane: MeetupPhaseCoordinationLane): {
  location: string;
  timeIso: string | null;
} {
  return {
    location: lane.location.trim(),
    timeIso: parseMeetupIso(lane.dateTimeIso ?? lane.proposedIso),
  };
}

export function logReturnCoordinationFieldDiff(trace: CoordinateProposalFieldDiffTrace): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  console.log('[return-field-diff]', {
    ts: new Date().toISOString(),
    baselineLocation: trace.baselineLocation,
    incomingLocation: trace.incomingLocation,
    locationChanged: trace.locationChanged,
    baselineTime: trace.baselineTime,
    incomingTime: trace.incomingTime,
    timeChanged: trace.timeChanged,
    viewerRole: trace.viewerRole,
    proposalVersion: trace.proposalVersion,
    baselineSource: trace.baselineSource,
    baselineTimeSource: trace.baselineTimeSource,
    lastProposedBy: trace.lastProposedBy,
  });
}

export function logCoordinateProposalFieldDiff(
  surface: string,
  rentalId: string,
  trace: CoordinateProposalFieldDiffTrace
): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  console.log('[coordinate-proposal-field-diff]', {
    ts: new Date().toISOString(),
    surface,
    rentalId,
    phase: trace.phase,
    baselineLocation: trace.baselineLocation,
    baselineTime: trace.baselineTime,
    baselineSource: trace.baselineSource,
    baselineTimeSource: trace.baselineTimeSource,
    incomingLocation: trace.incomingLocation,
    incomingTime: trace.incomingTime,
    locationChanged: trace.locationChanged,
    timeChanged: trace.timeChanged,
    proposalVersion: trace.proposalVersion,
    lastProposedBy: trace.lastProposedBy,
    viewerRole: trace.viewerRole,
  });
}

/**
 * Persistent field-level diff highlights while reviewing a counterparty proposal.
 * Clears when review ends, coordination finalizes, or values match the viewer baseline.
 */
export function resolveCounterpartyProposalFieldHighlights(input: {
  phase: CoordinateMeetupPhase;
  reviewingCounterpartyProposal: boolean;
  coordinationFinalized: boolean;
  lane: MeetupPhaseCoordinationLane;
  ctx: RentalWizardContext;
}): {
  highlightLocation: boolean;
  highlightTime: boolean;
  trace: CoordinateProposalFieldDiffTrace | null;
} {
  const proposalVersion =
    typeof input.ctx.rental.proposal_version === 'number' ? input.ctx.rental.proposal_version : null;
  const lastProposedBy = String(input.ctx.rental.last_proposed_by ?? '').trim() || null;

  const incoming = resolveIncomingMeetupProposalValues(input.lane);
  const baseline = resolveViewerMeetupBaselineForDiff({
    phase: input.phase,
    ctx: input.ctx,
  });

  const locationChanged =
    incoming.location.length > 0 && !meetupLocationsEqual(incoming.location, baseline.location);
  const timeChanged = incoming.timeIso != null && !meetupTimesEqual(incoming.timeIso, baseline.timeIso);

  const trace: CoordinateProposalFieldDiffTrace = {
    phase: input.phase,
    baselineLocation: baseline.location,
    baselineTime: baseline.timeIso,
    baselineSource: baseline.source,
    baselineTimeSource: baseline.timeSource,
    incomingLocation: incoming.location,
    incomingTime: incoming.timeIso,
    locationChanged,
    timeChanged,
    proposalVersion,
    lastProposedBy,
    viewerRole: input.ctx.viewerRole,
  };

  if (!input.reviewingCounterpartyProposal || input.coordinationFinalized) {
    return {
      highlightLocation: false,
      highlightTime: false,
      trace: null,
    };
  }

  return {
    highlightLocation: locationChanged,
    highlightTime: timeChanged,
    trace,
  };
}
