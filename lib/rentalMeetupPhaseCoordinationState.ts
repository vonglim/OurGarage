import { resolveMeetupAcceptanceKind, type RentalMeetupRow } from '@/lib/rentalMeetupProposalLifecycle';
import {
  resolveMeetupDisplaySchedule,
  type RentalMeetupRowLike,
  type ResolvedMeetupDisplaySchedule,
} from '@/lib/rentalMeetupDisplaySchedule';
import {
  reconcileOperationalPickupIso,
  reconcileOperationalReturnIso,
} from '@/lib/rentalWizard/proposedMeetupSchedule';
import {
  isPickupCoordinationCompleteFromRow,
  isReturnCoordinationCompleteFromRow,
} from '@/lib/rentalOwnerWorkspacePhase';

export type MeetupCoordinationPhase = 'pickup' | 'return';

export type MeetupPhaseCoordinationStatus =
  | 'not_scheduled'
  | 'confirmed'
  | 'pending_approval'
  | 'waiting_on_renter'
  | 'waiting_on_owner'
  | 'needs_response'
  | 'modified';

export type MeetupPhaseCoordinationLane = {
  phase: MeetupCoordinationPhase;
  status: MeetupPhaseCoordinationStatus;
  statusLabel: string;
  location: string;
  dateTimeIso: string | null;
  acceptedIso: string | null;
  proposedIso: string | null;
  isPendingThisPhase: boolean;
  isConfirmed: boolean;
  proposedBy: string | null;
  proposedByRole: 'owner' | 'renter' | null;
  viewerIsProposer: boolean;
  viewerCanAccept: boolean;
  viewerCanPropose: boolean;
  viewerCanModify: boolean;
  viewerCanDecline: boolean;
  unlocked: boolean;
  coordinationComplete: boolean;
};

/** Fresh object identity for React props when lane semantics change. */
export function cloneMeetupPhaseCoordinationLane(
  lane: MeetupPhaseCoordinationLane
): MeetupPhaseCoordinationLane {
  return { ...lane };
}

export type ResolvedMeetupPhaseCoordination = {
  pickup: MeetupPhaseCoordinationLane;
  return: MeetupPhaseCoordinationLane;
  /** True only when `agreed_return_datetime` is bilaterally accepted. */
  returnCoordinationComplete: boolean;
  globalHasPendingProposal: boolean;
  pendingPhase: MeetupCoordinationPhase | 'extension' | 'both' | null;
  schedule: ResolvedMeetupDisplaySchedule;
};

function parseIso(raw: string | null | undefined): string | null {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s || !Number.isFinite(Date.parse(s))) return null;
  return s;
}

function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
  const as = parseIso(a);
  const bs = parseIso(b);
  if (!as || !bs) return false;
  return Date.parse(as) === Date.parse(bs);
}

function roleForUser(
  userId: string | null,
  rental: RentalMeetupRowLike & { owner_user_id?: string; renter_user_id?: string }
): 'owner' | 'renter' | null {
  if (!userId) return null;
  if (userId === rental.owner_user_id) return 'owner';
  if (userId === rental.renter_user_id) return 'renter';
  return null;
}

export function inferPendingMeetupProposalPhase(input: {
  rental: RentalMeetupRow;
  schedule: ResolvedMeetupDisplaySchedule;
  isActiveRental?: boolean;
}): MeetupCoordinationPhase | 'extension' | 'both' | null {
  const { rental, schedule } = input;
  const hasPending =
    String(rental.agreement_status ?? '').trim() === 'pending' &&
    String(rental.last_proposed_by ?? '').trim().length > 0;
  if (!hasPending) return null;

  const proposedPickup =
    schedule.pendingPickupProposalIso ?? reconcileOperationalPickupIso(rental).iso;
  const proposedReturn =
    schedule.pendingReturnProposalIso ?? reconcileOperationalReturnIso(rental).iso;
  const acceptedPickup = schedule.acceptedPickupIso;
  const acceptedReturn = schedule.acceptedReturnIso;

  const pickupChanged = proposedPickup != null && !sameInstant(proposedPickup, acceptedPickup);
  const returnChanged = proposedReturn != null && !sameInstant(proposedReturn, acceptedReturn);

  if (pickupChanged && returnChanged) return 'both';

  const kind = resolveMeetupAcceptanceKind({
    row: rental,
    proposedPickup,
    proposedReturn,
    isActiveRental: input.isActiveRental ?? false,
    proposedAfterAgreed: Boolean(acceptedPickup && acceptedReturn),
  });
  if (kind === 'extension') return 'extension';
  if (kind === 'return') return 'return';
  if (pickupChanged) return 'pickup';
  if (returnChanged) return 'return';
  /** Pending row but operational matches agreed — treat as both so neither lane stays stale. */
  return 'both';
}

/** Whether a pending proposal applies to this coordination lane (pickup / return / extension). */
function lanePendingForPhase(input: {
  phase: MeetupCoordinationPhase;
  globalHasPendingProposal: boolean;
  pendingPhase: MeetupCoordinationPhase | 'extension' | 'both' | null;
  schedule: ResolvedMeetupDisplaySchedule;
  rental: RentalMeetupRowLike;
}): boolean {
  if (!input.globalHasPendingProposal) return false;
  if (input.pendingPhase === input.phase || input.pendingPhase === 'both') return true;
  if (input.pendingPhase === 'extension') {
    const proposedPickup =
      input.schedule.pendingPickupProposalIso ?? reconcileOperationalPickupIso(input.rental).iso;
    const proposedReturn =
      input.schedule.pendingReturnProposalIso ?? reconcileOperationalReturnIso(input.rental).iso;
    const pickupChanged =
      proposedPickup != null && !sameInstant(proposedPickup, input.schedule.acceptedPickupIso);
    const returnChanged =
      proposedReturn != null && !sameInstant(proposedReturn, input.schedule.acceptedReturnIso);
    return input.phase === 'pickup' ? pickupChanged : returnChanged;
  }
  return false;
}

function statusLabelFor(status: MeetupPhaseCoordinationStatus): string {
  switch (status) {
    case 'not_scheduled':
      return 'Not scheduled yet';
    case 'confirmed':
      return 'Confirmed';
    case 'pending_approval':
      return 'Pending approval';
    case 'waiting_on_renter':
      return 'Waiting on renter';
    case 'waiting_on_owner':
      return 'Waiting on owner';
    case 'needs_response':
      return 'Needs response';
    case 'modified':
      return 'Modified';
    default:
      return '—';
  }
}

function buildLane(input: {
  phase: MeetupCoordinationPhase;
  rental: RentalMeetupRowLike & { owner_user_id?: string; renter_user_id?: string };
  schedule: ResolvedMeetupDisplaySchedule;
  viewerUserId: string | null;
  globalHasPendingProposal: boolean;
  pendingPhase: MeetupCoordinationPhase | 'extension' | 'both' | null;
  pickupCoordinationComplete: boolean;
  returnUnlocked: boolean;
}): MeetupPhaseCoordinationLane {
  const isPickup = input.phase === 'pickup';
  const acceptedIso = isPickup ? input.schedule.acceptedPickupIso : input.schedule.acceptedReturnIso;
  const agreedIso = isPickup
    ? parseIso(input.schedule.acceptedPickupIso ?? input.rental.agreed_pickup_datetime)
    : parseIso(input.schedule.acceptedReturnIso ?? input.rental.agreed_return_datetime);
  const proposedIso = isPickup
    ? input.schedule.pendingPickupProposalIso ?? reconcileOperationalPickupIso(input.rental).iso
    : input.schedule.pendingReturnProposalIso ?? reconcileOperationalReturnIso(input.rental).iso;
  const displayIso = input.globalHasPendingProposal
    ? proposedIso ?? acceptedIso
    : acceptedIso ?? proposedIso;
  const location = isPickup
    ? (input.rental.meetup_location ?? input.rental.return_location ?? '').trim()
    : (input.rental.return_location ?? input.rental.meetup_location ?? '').trim();

  const isPendingThisPhase = lanePendingForPhase({
    phase: input.phase,
    globalHasPendingProposal: input.globalHasPendingProposal,
    pendingPhase: input.pendingPhase,
    schedule: input.schedule,
    rental: input.rental,
  });

  const coordinationComplete = isPickup
    ? input.pickupCoordinationComplete && !isPendingThisPhase
    : Boolean(agreedIso) && !isPendingThisPhase;

  const isConfirmed = isPickup
    ? input.pickupCoordinationComplete && !isPendingThisPhase
    : Boolean(agreedIso) && !isPendingThisPhase;

  const proposedBy = input.globalHasPendingProposal
    ? String(input.rental.last_proposed_by ?? '').trim() || null
    : null;
  const proposedByRole = roleForUser(proposedBy, input.rental);
  const viewerRole = roleForUser(input.viewerUserId, input.rental);
  const viewerIsProposer = Boolean(proposedBy && input.viewerUserId && proposedBy === input.viewerUserId);

  const unlocked = isPickup ? true : input.returnUnlocked;

  let status: MeetupPhaseCoordinationStatus;
  if (!unlocked) {
    status = 'not_scheduled';
  } else if (isConfirmed) {
    status = 'confirmed';
  } else if (isPendingThisPhase) {
    if (viewerIsProposer) {
      status = viewerRole === 'owner' ? 'waiting_on_renter' : 'waiting_on_owner';
    } else {
      status = 'needs_response';
    }
  } else if (!isPickup && !agreedIso) {
    status = 'not_scheduled';
  } else if (!displayIso && !location) {
    status = 'not_scheduled';
  } else if (displayIso || location) {
    status = 'modified';
  } else {
    status = 'not_scheduled';
  }

  const viewerCanAccept = unlocked && isPendingThisPhase && !viewerIsProposer;
  const viewerCanPropose = unlocked && !isPendingThisPhase && !coordinationComplete;
  const viewerCanModify =
    unlocked &&
    ((isPendingThisPhase && viewerIsProposer) ||
      isConfirmed ||
      (!isPendingThisPhase && Boolean(displayIso || location)));
  const viewerCanDecline = viewerCanAccept;

  return {
    phase: input.phase,
    status,
    statusLabel: !unlocked && !isPickup ? 'Unlocks after pickup confirmed' : statusLabelFor(status),
    location,
    dateTimeIso: displayIso,
    acceptedIso,
    proposedIso,
    isPendingThisPhase,
    isConfirmed,
    proposedBy,
    proposedByRole,
    viewerIsProposer,
    viewerCanAccept,
    viewerCanPropose,
    viewerCanModify,
    viewerCanDecline,
    unlocked,
    coordinationComplete,
  };
}

export function resolveMeetupPhaseCoordination(input: {
  rental: RentalMeetupRow;
  viewerUserId?: string | null;
  requestSchedulingMeta?: unknown;
  pickupHandoffComplete?: boolean;
}): ResolvedMeetupPhaseCoordination {
  const schedule = resolveMeetupDisplaySchedule({
    rental: input.rental,
    requestSchedulingMeta: input.requestSchedulingMeta,
  });
  const globalHasPendingProposal = schedule.hasPendingProposal;
  const lifecycleStatus = String(input.rental.status ?? '').trim().toLowerCase();
  const isActiveRental = ['handed_off', 'active', 'return_pending'].includes(lifecycleStatus);
  const pendingPhase = inferPendingMeetupProposalPhase({
    rental: input.rental,
    schedule,
    isActiveRental,
  });
  const pickupCoordinationComplete = isPickupCoordinationCompleteFromRow(input.rental);
  const returnCoordinationComplete = isReturnCoordinationCompleteFromRow(input.rental);
  const returnUnlocked =
    pickupCoordinationComplete ||
    input.pickupHandoffComplete === true ||
    isActiveRental;

  const pickup = buildLane({
    phase: 'pickup',
    rental: input.rental,
    schedule,
    viewerUserId: input.viewerUserId ?? null,
    globalHasPendingProposal,
    pendingPhase,
    pickupCoordinationComplete,
    returnUnlocked,
  });
  const returnLane = buildLane({
    phase: 'return',
    rental: input.rental,
    schedule,
    viewerUserId: input.viewerUserId ?? null,
    globalHasPendingProposal,
    pendingPhase,
    pickupCoordinationComplete,
    /** Unlock from row-level pickup agreement — not pickup lane UI state (which clears while pickup is pending). */
    returnUnlocked,
  });

  return {
    pickup,
    return: returnLane,
    returnCoordinationComplete,
    globalHasPendingProposal,
    pendingPhase,
    schedule,
  };
}

export function logMeetupPhaseCoordination(
  rentalId: string,
  coordination: ResolvedMeetupPhaseCoordination,
  extra?: {
    surface?: string;
    agreement_status?: string | null;
    last_proposed_by?: string | null;
    proposed_return_datetime?: string | null;
    coordinationLiveRevision?: number;
  }
): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  console.log('[rental-meetup-phase-coordination]', {
    rentalId,
    surface: extra?.surface ?? null,
    coordinationLiveRevision: extra?.coordinationLiveRevision ?? null,
    agreement_status: extra?.agreement_status ?? null,
    last_proposed_by: extra?.last_proposed_by ?? null,
    proposed_return_datetime: extra?.proposed_return_datetime ?? null,
    pendingPhase: coordination.pendingPhase,
    globalHasPendingProposal: coordination.globalHasPendingProposal,
    pickupStatus: coordination.pickup.status,
    returnStatus: coordination.return.status,
    returnLaneStatus: coordination.return.status,
    pickupPending: coordination.pickup.isPendingThisPhase,
    returnPending: coordination.return.isPendingThisPhase,
    returnUnlocked: coordination.return.unlocked,
    returnViewerCanAccept: coordination.return.viewerCanAccept,
    returnCoordinationComplete: coordination.returnCoordinationComplete,
  });
}
