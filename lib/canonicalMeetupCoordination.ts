/**
 * Single canonical meetup coordination engine — all surfaces derive from here.
 * Presentation differs by viewer role; lane truth does not.
 */
import { logScenario } from '@/lib/rentalLifecycle/scenarioDevLog';
import {
  isPickupCoordinationCompleteFromRow,
  isReturnCoordinationCompleteFromRow,
} from '@/lib/rentalOwnerWorkspacePhase';
import type { RentalMeetupRow } from '@/lib/rentalMeetupProposalLifecycle';
import {
  cloneMeetupPhaseCoordinationLane,
  resolveMeetupPhaseCoordination,
  type MeetupCoordinationPhase,
  type MeetupPhaseCoordinationLane,
  type MeetupPhaseCoordinationStatus,
  type ResolvedMeetupPhaseCoordination,
} from '@/lib/rentalMeetupPhaseCoordinationState';
import {
  reconcileOperationalPickupIso,
  reconcileOperationalReturnIso,
} from '@/lib/rentalWizard/proposedMeetupSchedule';
import type { ResolvedMeetupDisplaySchedule } from '@/lib/rentalMeetupDisplaySchedule';

export const CANONICAL_MEETUP_COORDINATION_RESOLVER = 'resolveCanonicalMeetupCoordinationState' as const;

export type MeetupCoordinationViewerRole = 'owner' | 'renter';

export type MeetupCoordinationPresentationSurface = 'owner_workspace' | 'renter_wizard';

export type CanonicalMeetupCoordinationPresentation = {
  showPickupAccept: boolean;
  showReturnAccept: boolean;
  showPickupPendingPill: boolean;
  showReturnPendingPill: boolean;
  showMeetingAccept: boolean;
  showMeetingPendingPill: boolean;
  showMeetingPrimaryAction: boolean;
  meetingStatusText: string;
  meetingInlineTitle: string;
  meetingCollapsedSummary: string;
};

export type CanonicalMeetupCoordinationState = {
  resolver: typeof CANONICAL_MEETUP_COORDINATION_RESOLVER;
  revision: number;
  rentalId: string;
  viewerUserId: string | null;
  viewerRole: MeetupCoordinationViewerRole;
  presentationSurface: MeetupCoordinationPresentationSurface;
  /** Lane derivation — pickup / return / schedule / pending phase. */
  lanes: ResolvedMeetupPhaseCoordination;
  pickup: MeetupPhaseCoordinationLane;
  return: MeetupPhaseCoordinationLane;
  schedule: ResolvedMeetupDisplaySchedule;
  pickupCoordinationComplete: boolean;
  returnCoordinationComplete: boolean;
  meetupCoordinationComplete: boolean;
  globalHasPendingProposal: boolean;
  hasPendingProposal: boolean;
  pendingPhase: MeetupCoordinationPhase | 'extension' | 'both' | null;
  agreementStatus: string | null;
  lastProposedBy: string | null;
  iProposedLast: boolean;
  operationalPickupIso: string | null;
  operationalReturnIso: string | null;
  pickupIso: string | null;
  returnIso: string | null;
  location: string;
  presentation: CanonicalMeetupCoordinationPresentation;
};

export type CanonicalMeetupCoordinationInput = {
  rental: RentalMeetupRow;
  viewerUserId?: string | null;
  viewerRole: MeetupCoordinationViewerRole;
  presentationSurface: MeetupCoordinationPresentationSurface;
  requestSchedulingMeta?: unknown;
  pickupHandoffComplete?: boolean;
  /** Bumped on each realtime coordination patch so React recomputes. */
  revision?: number;
};

function coordinationLaneDigest(lane: MeetupPhaseCoordinationLane): string {
  return JSON.stringify({
    status: lane.status,
    viewerCanAccept: lane.viewerCanAccept,
    isPendingThisPhase: lane.isPendingThisPhase,
    dateTimeIso: lane.dateTimeIso,
    location: lane.location,
    statusLabel: lane.statusLabel,
    viewerCanPropose: lane.viewerCanPropose,
    viewerCanModify: lane.viewerCanModify,
    coordinationComplete: lane.coordinationComplete,
    unlocked: lane.unlocked,
  });
}

const canonicalLaneIdentityPrev = new Map<
  string,
  {
    pickup: MeetupPhaseCoordinationLane;
    return: MeetupPhaseCoordinationLane;
    lanesPickup: MeetupPhaseCoordinationLane;
    pickupDigest: string;
    returnDigest: string;
    revision: number;
  }
>();

function logCanonicalLaneIdentity(state: CanonicalMeetupCoordinationState): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  const key = `${state.rentalId}:${state.presentationSurface}`;
  const prev = canonicalLaneIdentityPrev.get(key);
  const pickupLaneDigest = coordinationLaneDigest(state.pickup);
  const returnLaneDigest = coordinationLaneDigest(state.return);
  console.log('[canonical-lane-identity]', {
    rentalId: state.rentalId,
    surface: state.presentationSurface,
    revision: state.revision,
    pickupLaneReferenceChanged: prev != null ? prev.pickup !== state.pickup : null,
    returnLaneReferenceChanged: prev != null ? prev.return !== state.return : null,
    lanesPickupReferenceChanged: prev != null ? prev.lanesPickup !== state.lanes.pickup : null,
    pickupLaneDigest,
    previousPickupLaneDigest: prev?.pickupDigest ?? null,
    returnLaneDigest,
    previousReturnLaneDigest: prev?.returnDigest ?? null,
    pickupSemanticsChanged: prev != null ? prev.pickupDigest !== pickupLaneDigest : null,
    returnSemanticsChanged: prev != null ? prev.returnDigest !== returnLaneDigest : null,
  });
  canonicalLaneIdentityPrev.set(key, {
    pickup: state.pickup,
    return: state.return,
    lanesPickup: state.lanes.pickup,
    pickupDigest: pickupLaneDigest,
    returnDigest: returnLaneDigest,
    revision: state.revision,
  });
}

export function roleForViewerOnRental(
  rental: RentalMeetupRow,
  viewerUserId: string | null | undefined
): MeetupCoordinationViewerRole {
  if (viewerUserId && viewerUserId === rental.owner_user_id) return 'owner';
  if (viewerUserId && viewerUserId === rental.renter_user_id) return 'renter';
  return 'renter';
}

function buildPresentation(input: {
  lanes: ResolvedMeetupPhaseCoordination;
  viewerRole: MeetupCoordinationViewerRole;
  pickupCoordinationComplete: boolean;
  returnCoordinationComplete: boolean;
  meetupCoordinationComplete: boolean;
}): CanonicalMeetupCoordinationPresentation {
  const { pickup, return: returnLane } = input.lanes;

  const showPickupAccept = pickup.viewerCanAccept;
  const showReturnAccept = returnLane.viewerCanAccept;
  const showPickupPendingPill = pickup.isPendingThisPhase && pickup.viewerIsProposer;
  const showReturnPendingPill = returnLane.isPendingThisPhase && returnLane.viewerIsProposer;
  const showMeetingAccept = showPickupAccept || showReturnAccept;
  const showMeetingPendingPill = showPickupPendingPill || showReturnPendingPill;
  const showMeetingPrimaryAction =
    !input.meetupCoordinationComplete &&
    (pickup.viewerCanPropose ||
      pickup.viewerCanModify ||
      (returnLane.unlocked && (returnLane.viewerCanPropose || returnLane.viewerCanModify))) &&
    !showMeetingAccept;

  const meetingStatusText = input.meetupCoordinationComplete
    ? 'Pickup and return schedules are confirmed.'
    : input.pickupCoordinationComplete &&
        !input.returnCoordinationComplete &&
        !showReturnAccept &&
        !showReturnPendingPill
      ? 'Pickup confirmed — coordinate return details next.'
      : showReturnAccept || showReturnPendingPill
        ? returnLane.statusLabel
        : showPickupAccept || showPickupPendingPill
          ? pickup.statusLabel
          : 'No active proposal';

  const counterpartyNoun = input.viewerRole === 'owner' ? 'renter' : 'owner';
  const meetingInlineTitle = showReturnAccept
    ? 'Return proposal waiting for your response.'
    : showPickupAccept
      ? 'Pickup proposal waiting for your response.'
      : showReturnPendingPill
        ? `Waiting on the ${counterpartyNoun} to respond to your return proposal.`
        : showPickupPendingPill
          ? `Waiting on the ${counterpartyNoun} to respond to your pickup proposal.`
          : 'Pickup coordination not scheduled yet.';

  const meetingCollapsedSummary = meetingStatusText;

  return {
    showPickupAccept,
    showReturnAccept,
    showPickupPendingPill,
    showReturnPendingPill,
    showMeetingAccept,
    showMeetingPendingPill,
    showMeetingPrimaryAction,
    meetingStatusText,
    meetingInlineTitle,
    meetingCollapsedSummary,
  };
}

/** Canonical coordination — the only resolver UI surfaces should call. */
export function resolveCanonicalMeetupCoordinationState(
  input: CanonicalMeetupCoordinationInput
): CanonicalMeetupCoordinationState {
  const viewerUserId = input.viewerUserId ?? null;
  const viewerRole = roleForViewerOnRental(input.rental, viewerUserId);
  const callerViewerRole = input.viewerRole;
  const revision = input.revision ?? 0;

  const lanes = resolveMeetupPhaseCoordination({
    rental: input.rental,
    viewerUserId,
    requestSchedulingMeta: input.requestSchedulingMeta,
    pickupHandoffComplete: input.pickupHandoffComplete,
  });

  const pickupCoordinationComplete = isPickupCoordinationCompleteFromRow(input.rental);
  const returnCoordinationComplete = isReturnCoordinationCompleteFromRow(input.rental);
  const meetupCoordinationComplete =
    pickupCoordinationComplete && returnCoordinationComplete;

  const pickupOp = reconcileOperationalPickupIso(input.rental);
  const returnOp = reconcileOperationalReturnIso(input.rental);
  const lastProposedBy = lanes.schedule.lastProposedBy;
  const agreementStatus = String(input.rental.agreement_status ?? '').trim() || null;

  const pickupLane = cloneMeetupPhaseCoordinationLane(lanes.pickup);
  const returnLane = cloneMeetupPhaseCoordinationLane(lanes.return);
  const lanesCloned: ResolvedMeetupPhaseCoordination = {
    ...lanes,
    pickup: pickupLane,
    return: returnLane,
  };

  const state: CanonicalMeetupCoordinationState = {
    resolver: CANONICAL_MEETUP_COORDINATION_RESOLVER,
    revision,
    rentalId: input.rental.id,
    viewerUserId,
    viewerRole,
    presentationSurface: input.presentationSurface,
    lanes: lanesCloned,
    pickup: pickupLane,
    return: returnLane,
    schedule: lanes.schedule,
    pickupCoordinationComplete,
    returnCoordinationComplete,
    meetupCoordinationComplete,
    globalHasPendingProposal: lanes.globalHasPendingProposal,
    hasPendingProposal: lanes.globalHasPendingProposal,
    pendingPhase: lanes.pendingPhase,
    agreementStatus,
    lastProposedBy,
    iProposedLast: Boolean(viewerUserId && lastProposedBy && lastProposedBy === viewerUserId),
    operationalPickupIso: pickupOp.iso,
    operationalReturnIso: returnOp.iso,
    pickupIso: lanes.schedule.pickupIso,
    returnIso: lanes.schedule.returnIso,
    location: lanes.schedule.location,
    presentation: buildPresentation({
      lanes: lanesCloned,
      viewerRole,
      pickupCoordinationComplete,
      returnCoordinationComplete,
      meetupCoordinationComplete,
    }),
  };

  logCanonicalLaneIdentity(state);

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    const ownerUserId = String(input.rental.owner_user_id ?? '').trim() || null;
    const renterUserId = String(input.rental.renter_user_id ?? '').trim() || null;
    const lastProposedBy = String(state.lastProposedBy ?? '').trim() || null;
    console.log('[canonical-resolver-audit]', {
      surface: input.presentationSurface,
      viewerRole,
      callerViewerRole: callerViewerRole ?? null,
      viewerRoleMismatch:
        callerViewerRole != null && callerViewerRole !== viewerRole ? true : false,
      viewerUserId,
      ownerUserId,
      renterUserId,
      lastProposedBy: state.lastProposedBy,
      pickupLaneStatus: state.pickup.status,
      returnLaneStatus: state.return.status,
      pickupViewerCanAccept: state.pickup.viewerCanAccept,
      returnViewerCanAccept: state.return.viewerCanAccept,
      pickupPending: state.pickup.isPendingThisPhase,
      returnPending: state.return.isPendingThisPhase,
      pendingPhase: state.pendingPhase,
      derivedFrom: {
        pickup: {
          proposerIsViewer: Boolean(viewerUserId && lastProposedBy && lastProposedBy === viewerUserId),
          proposerIsOwner: Boolean(ownerUserId && lastProposedBy && lastProposedBy === ownerUserId),
          proposerIsRenter: Boolean(renterUserId && lastProposedBy && lastProposedBy === renterUserId),
        },
        return: {
          proposerIsViewer: Boolean(viewerUserId && lastProposedBy && lastProposedBy === viewerUserId),
          proposerIsOwner: Boolean(ownerUserId && lastProposedBy && lastProposedBy === ownerUserId),
          proposerIsRenter: Boolean(renterUserId && lastProposedBy && lastProposedBy === renterUserId),
        },
      },
    });
  }

  return state;
}

/** Recompute after rental row patch (optional revision bump). */
export function recomputeCanonicalMeetupCoordination(
  input: CanonicalMeetupCoordinationInput & {
    previousRevision?: number;
    bumpRevision?: boolean;
  }
): CanonicalMeetupCoordinationState {
  const base = input.previousRevision ?? input.revision ?? 0;
  return resolveCanonicalMeetupCoordinationState({
    ...input,
    revision: base + (input.bumpRevision ? 1 : 0),
  });
}

export type CanonicalMeetupCoordinationDriftSurface =
  | 'owner_workspace'
  | 'renter_wizard'
  | 'activity'
  | 'home_card'
  | 'chat';

type CanonicalDriftRecord = {
  surface: CanonicalMeetupCoordinationDriftSurface;
  state: CanonicalMeetupCoordinationState;
  lifecyclePhase?: string;
};

const canonicalDriftByRental = new Map<string, Map<CanonicalMeetupCoordinationDriftSurface, CanonicalDriftRecord>>();

export function recordCanonicalMeetupCoordinationSnapshot(input: {
  rentalId: string;
  surface: CanonicalMeetupCoordinationDriftSurface;
  state: CanonicalMeetupCoordinationState;
  lifecyclePhase?: string;
}): void {
  if (!canonicalDriftByRental.has(input.rentalId)) {
    canonicalDriftByRental.set(input.rentalId, new Map());
  }
  canonicalDriftByRental.get(input.rentalId)!.set(input.surface, {
    surface: input.surface,
    state: input.state,
    lifecyclePhase: input.lifecyclePhase,
  });

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    logCanonicalMeetupCoordination(input.state, { surface: input.surface, lifecyclePhase: input.lifecyclePhase });
    logCanonicalMeetupCoordinationDrift(input.rentalId, { trigger: `surface:${input.surface}` });
  }
}

export function logCanonicalMeetupCoordination(
  state: CanonicalMeetupCoordinationState,
  extra?: { surface?: string; lifecyclePhase?: string | null }
): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  console.log('[canonical-meetup-coordination]', {
    rentalId: state.rentalId,
    surface: extra?.surface ?? state.presentationSurface,
    resolver: state.resolver,
    revision: state.revision,
    viewerRole: state.viewerRole,
    agreement_status: state.agreementStatus,
    last_proposed_by: state.lastProposedBy,
    proposed_pickup_datetime: state.operationalPickupIso,
    proposed_return_datetime: state.operationalReturnIso,
    pickupIso: state.pickupIso,
    returnIso: state.returnIso,
    pendingPhase: state.pendingPhase,
    pickupLaneStatus: state.pickup.status,
    returnLaneStatus: state.return.status,
    pickupPending: state.pickup.isPendingThisPhase,
    returnPending: state.return.isPendingThisPhase,
    returnUnlocked: state.return.unlocked,
    returnViewerCanAccept: state.return.viewerCanAccept,
    presentation: state.presentation,
    lifecyclePhase: extra?.lifecyclePhase ?? null,
  });
}

export function logCanonicalMeetupCoordinationDrift(
  rentalId: string,
  extra?: { trigger?: string }
): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;

  const surfaces = canonicalDriftByRental.get(rentalId);
  if (!surfaces || surfaces.size === 0) return;

  const pick = (s: CanonicalDriftRecord | undefined) => s?.state;

  const owner = surfaces.get('owner_workspace')?.state;
  const wizard = surfaces.get('renter_wizard')?.state;
  const activity = surfaces.get('activity')?.state;
  const home = surfaces.get('home_card')?.state;
  const chat = surfaces.get('chat')?.state;

  const viewerUserIdBySurface = {
    owner_workspace: owner?.viewerUserId ?? null,
    renter_wizard: wizard?.viewerUserId ?? null,
    activity: activity?.viewerUserId ?? null,
    home_card: home?.viewerUserId ?? null,
    chat: chat?.viewerUserId ?? null,
  };
  const viewerRoleBySurface = {
    owner_workspace: owner?.viewerRole ?? null,
    renter_wizard: wizard?.viewerRole ?? null,
    activity: activity?.viewerRole ?? null,
    home_card: home?.viewerRole ?? null,
    chat: chat?.viewerRole ?? null,
  };

  const returnLaneStatusBySurface = {
    owner_workspace: owner?.return.status ?? null,
    renter_wizard: wizard?.return.status ?? null,
    activity: activity?.return.status ?? null,
    home_card: home?.return.status ?? null,
    chat: chat?.return.status ?? null,
  };
  const pickupLaneStatusBySurface = {
    owner_workspace: owner?.pickup.status ?? null,
    renter_wizard: wizard?.pickup.status ?? null,
    activity: activity?.pickup.status ?? null,
    home_card: home?.pickup.status ?? null,
    chat: chat?.pickup.status ?? null,
  };

  const returnIsos = [owner?.returnIso, wizard?.returnIso, activity?.returnIso, home?.returnIso, chat?.returnIso].filter(
    (v) => v != null
  );
  const uniqueReturnIsos = new Set(returnIsos.map(String));

  const sameViewerPickupStatuses = new Set<string>();
  const sameViewerReturnStatuses = new Set<string>();
  const entries = [...surfaces.entries()];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i][1].state;
      const b = entries[j][1].state;
      const sameViewer =
        a.viewerUserId != null && b.viewerUserId != null && a.viewerUserId === b.viewerUserId;
      if (!sameViewer) continue;
      sameViewerPickupStatuses.add(a.pickup.status);
      sameViewerPickupStatuses.add(b.pickup.status);
      sameViewerReturnStatuses.add(a.return.status);
      sameViewerReturnStatuses.add(b.return.status);
    }
  }

  const crossViewerPickup = new Set(
    [owner?.pickup.status, wizard?.pickup.status, home?.pickup.status, activity?.pickup.status].filter(Boolean)
  );
  const crossViewerReturn = new Set(
    [owner?.return.status, wizard?.return.status, home?.return.status, activity?.return.status].filter(Boolean)
  );

  logScenario('lifecycle', {
    event: 'canonical_meetup_coordination_drift',
    tag: 'canonical-meetup-coordination-drift',
    rentalId,
    trigger: extra?.trigger ?? 'compare',
    note:
      'pickupLaneDriftDetected compares surfaces with the SAME viewerUserId only. ' +
      'Owner home_card vs renter wizard differing is expected viewer-relative semantics.',
    resolverBySurface: {
      owner_workspace: pick(surfaces.get('owner_workspace'))?.resolver ?? null,
      renter_wizard: pick(surfaces.get('renter_wizard'))?.resolver ?? null,
      activity: pick(surfaces.get('activity'))?.resolver ?? null,
      home_card: pick(surfaces.get('home_card'))?.resolver ?? null,
      chat: pick(surfaces.get('chat'))?.resolver ?? null,
    },
    viewerUserIdBySurface,
    viewerRoleBySurface,
    returnLaneStatusBySurface,
    pickupLaneStatusBySurface,
    returnIsoBySurface: {
      owner_workspace: owner?.returnIso ?? null,
      renter_wizard: wizard?.returnIso ?? null,
      activity: activity?.returnIso ?? null,
      home_card: home?.returnIso ?? null,
      chat: chat?.returnIso ?? null,
    },
    agreement_status: owner?.agreementStatus ?? wizard?.agreementStatus ?? null,
    last_proposed_by: owner?.lastProposedBy ?? wizard?.lastProposedBy ?? null,
    revisionBySurface: {
      owner_workspace: owner?.revision ?? null,
      renter_wizard: wizard?.revision ?? null,
    },
    returnIsoDriftDetected: uniqueReturnIsos.size > 1,
    returnLaneDriftDetected: sameViewerReturnStatuses.size > 1,
    pickupLaneDriftDetected: sameViewerPickupStatuses.size > 1,
    crossViewerPickupLaneSpread: crossViewerPickup.size > 1,
    crossViewerReturnLaneSpread: crossViewerReturn.size > 1,
    canonicalDriftDetected:
      uniqueReturnIsos.size > 1 ||
      sameViewerReturnStatuses.size > 1 ||
      sameViewerPickupStatuses.size > 1,
  });
}

export function clearCanonicalMeetupCoordinationDrift(rentalId: string): void {
  canonicalDriftByRental.delete(rentalId);
}

/** Schedule-only helper for cards/sorting — still canonical resolver. */
export function canonicalMeetupScheduleForRow(
  rental: RentalMeetupRow,
  viewerUserId?: string | null,
  requestSchedulingMeta?: unknown
): ResolvedMeetupDisplaySchedule {
  const uid = viewerUserId ?? null;
  const role = roleForViewerOnRental(rental, uid);
  return resolveCanonicalMeetupCoordinationState({
    rental,
    viewerUserId: uid,
    viewerRole: role,
    presentationSurface: role === 'owner' ? 'owner_workspace' : 'renter_wizard',
    requestSchedulingMeta,
  }).schedule;
}

export type { MeetupPhaseCoordinationLane, MeetupPhaseCoordinationStatus, MeetupCoordinationPhase };
