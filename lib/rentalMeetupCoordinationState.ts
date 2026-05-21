import { logScenario } from '@/lib/rentalLifecycle/scenarioDevLog';
import {
  reconcileOperationalPickupIso,
  reconcileOperationalReturnIso,
} from '@/lib/rentalWizard/proposedMeetupSchedule';
import { isReturnCoordinationCompleteFromRow } from '@/lib/rentalOwnerWorkspacePhase';
import { isMeetupCoordinationCompleteFromRow } from '@/lib/rentalStageTransitionAudit';
import {
  hasReturnCoordinationAgreed,
  isMeetupCoordinationComplete,
  isPickupCoordinationComplete,
} from '@/lib/rentalWizard/rentalWizardGates';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';
import {
  recordCanonicalMeetupCoordinationSnapshot,
  resolveCanonicalMeetupCoordinationState,
  type MeetupCoordinationPresentationSurface,
} from '@/lib/canonicalMeetupCoordination';
import {
  resolveMeetupDisplaySchedule,
  type RentalMeetupRowLike,
  type ResolvedMeetupDisplaySchedule,
} from '@/lib/rentalMeetupDisplaySchedule';
import type { RentalMeetupRow } from '@/lib/rentalMeetupProposalLifecycle';

export type MeetupCoordinationSurface =
  | 'wizard'
  | 'workspace'
  | 'workspace_phase_lanes'
  | 'chat'
  | 'activity'
  | 'home_card'
  | 'transition_resolver';

export type MeetupCoordinationGateSnapshot = {
  pickupCoordinationComplete: boolean;
  /** Operational/contract return hint — not bilateral acceptance. */
  hasReturnSchedule: boolean;
  /** Bilateral return accepted (`agreed_return_datetime`). */
  returnCoordinationAgreed: boolean;
  returnCoordinationAcknowledged: boolean;
  meetupCoordinationComplete: boolean;
  pickupConfirmedSeen: boolean;
  returnConfirmedSeen: boolean;
};

export type MeetupCoordinationState = {
  schedule: ResolvedMeetupDisplaySchedule;
  operationalPickupIso: string | null;
  operationalReturnIso: string | null;
  agreementStatus: string | null;
  /** Bilateral pickup + return agreed on row. */
  meetupCoordinationComplete: boolean;
  /** @deprecated alias — use meetupCoordinationComplete */
  meetingCompleted: boolean;
  hasPendingProposal: boolean;
  gates: MeetupCoordinationGateSnapshot | null;
};

type DriftSurfaceRecord = {
  surface: MeetupCoordinationSurface;
  resolver: string;
  pickupIso: string | null;
  returnIso: string | null;
  pickupSource: string;
  returnSource: string;
  agreedPickupIso: string | null;
  agreedReturnIso: string | null;
  operationalPickupIso: string | null;
  operationalReturnIso: string | null;
  lifecyclePhase?: string;
  returnCoordinationComplete?: boolean;
  last_proposed_by?: string | null;
  agreement_status?: string | null;
  return_confirmed_seen?: boolean;
  pickupLaneStatus?: string;
  returnLaneStatus?: string;
  pendingPhase?: string | null;
};

const driftByRental = new Map<string, Map<MeetupCoordinationSurface, DriftSurfaceRecord>>();

/** Single UI/read resolver — delegates to display schedule (operational vs agreed precedence). */
export function resolveMeetupCoordinationState(input: {
  rental: RentalMeetupRowLike;
  requestSchedulingMeta?: unknown;
  hasPendingProposal?: boolean;
  wizardCtx?: RentalWizardContext | null;
}): MeetupCoordinationState {
  const schedule = resolveMeetupDisplaySchedule({
    rental: input.rental,
    requestSchedulingMeta: input.requestSchedulingMeta,
    hasPendingProposal: input.hasPendingProposal,
  });
  const pickupOp = reconcileOperationalPickupIso(input.rental);
  const returnOp = reconcileOperationalReturnIso(input.rental);

  const agreementStatus = String(input.rental.agreement_status ?? '').trim() || null;
  const meetupCoordinationComplete = isMeetupCoordinationCompleteFromRow(input.rental);
  const meetingCompleted = meetupCoordinationComplete;

  let gates: MeetupCoordinationGateSnapshot | null = null;
  if (input.wizardCtx) {
    gates = evaluateMeetupCoordinationGates(input.wizardCtx, schedule);
  }

  return {
    schedule,
    operationalPickupIso: pickupOp.iso,
    operationalReturnIso: returnOp.iso,
    agreementStatus,
    meetupCoordinationComplete,
    meetingCompleted,
    hasPendingProposal: schedule.hasPendingProposal,
    gates,
  };
}

/** Row-only helper for activity/home cards without request meta. */
export function resolveMeetupScheduleFromRow(
  rental: RentalMeetupRowLike,
  requestSchedulingMeta?: unknown
): ResolvedMeetupDisplaySchedule {
  return resolveMeetupDisplaySchedule({ rental, requestSchedulingMeta });
}

/** Wizard lifecycle gates — return schedule uses canonical display/agreed, not raw column OR. */
export function evaluateMeetupCoordinationGates(
  ctx: RentalWizardContext,
  schedule?: ResolvedMeetupDisplaySchedule
): MeetupCoordinationGateSnapshot {
  const resolved =
    schedule ??
    resolveMeetupDisplaySchedule({
      rental: ctx.rental,
      requestSchedulingMeta: ctx.requestSchedulingMeta,
      hasPendingProposal: ctx.hasPendingProposal,
    });

  const hasReturnSchedule = Boolean(resolved.returnIso?.trim() || resolved.acceptedReturnIso?.trim());

  return {
    pickupCoordinationComplete: isPickupCoordinationComplete(ctx),
    hasReturnSchedule,
    returnCoordinationAgreed: hasReturnCoordinationAgreed(ctx),
    returnCoordinationAcknowledged: Boolean(ctx.wizardProgress.pickup_return_coordination_ack_at?.trim()),
    meetupCoordinationComplete: isMeetupCoordinationComplete(ctx),
    pickupConfirmedSeen: ctx.seenTransitions.has('pickup_confirmed_seen'),
    returnConfirmedSeen: ctx.seenTransitions.has('return_confirmed_seen'),
  };
}

/** Whether rental row has a resolvable return meetup time (operational or agreed). */
export function rentalRowHasReturnSchedule(
  rental: RentalMeetupRowLike,
  requestSchedulingMeta?: unknown,
  hasPendingProposal?: boolean
): boolean {
  const schedule = resolveMeetupDisplaySchedule({
    rental,
    requestSchedulingMeta,
    hasPendingProposal,
  });
  return Boolean(schedule.returnIso?.trim() || schedule.acceptedReturnIso?.trim());
}

export function recordMeetupCoordinationSurfaceSnapshot(input: {
  rentalId: string;
  surface: MeetupCoordinationSurface;
  resolver: string;
  rental: RentalMeetupRowLike;
  requestSchedulingMeta?: unknown;
  hasPendingProposal?: boolean;
  wizardCtx?: RentalWizardContext | null;
  lifecyclePhase?: string;
  viewerUserId?: string | null;
  pickupHandoffComplete?: boolean;
}): MeetupCoordinationState {
  const state = resolveMeetupCoordinationState({
    rental: input.rental,
    requestSchedulingMeta: input.requestSchedulingMeta,
    hasPendingProposal: input.hasPendingProposal,
    wizardCtx: input.wizardCtx,
  });

  const row = input.rental as RentalMeetupRow;
  const viewerUserId =
    input.viewerUserId ?? input.wizardCtx?.viewerUserId ?? input.wizardCtx?.rental.renter_user_id ?? null;
  const viewerRole =
    viewerUserId && viewerUserId === row.owner_user_id ? 'owner' : 'renter';
  const canonical = resolveCanonicalMeetupCoordinationState({
    rental: row,
    viewerUserId,
    viewerRole,
    presentationSurface: presentationSurfaceFromLegacy(input.surface, row, viewerUserId),
    requestSchedulingMeta: input.requestSchedulingMeta,
    pickupHandoffComplete: input.pickupHandoffComplete ?? input.wizardCtx?.pickupHandoffComplete,
  });
  const driftSurface: import('@/lib/canonicalMeetupCoordination').CanonicalMeetupCoordinationDriftSurface =
    input.surface === 'wizard'
      ? 'renter_wizard'
      : input.surface === 'workspace' || input.surface === 'workspace_phase_lanes'
        ? 'owner_workspace'
        : input.surface === 'activity'
          ? 'activity'
          : input.surface === 'home_card'
            ? 'home_card'
            : 'chat';
  recordCanonicalMeetupCoordinationSnapshot({
    rentalId: input.rentalId,
    surface: driftSurface,
    state: canonical,
    lifecyclePhase: input.lifecyclePhase,
  });

  return state;
}

function presentationSurfaceFromLegacy(
  surface: MeetupCoordinationSurface,
  rental: RentalMeetupRow,
  viewerUserId?: string | null
): MeetupCoordinationPresentationSurface {
  if (surface === 'wizard' || surface === 'workspace_phase_lanes') return 'renter_wizard';
  const uid = viewerUserId ?? '';
  if (uid && uid === rental.owner_user_id) return 'owner_workspace';
  return 'renter_wizard';
}

/** @deprecated Use recordCanonicalMeetupCoordinationSnapshot — kept for call-site migration. */
export function recordMeetupPhaseCoordinationSurfaceSnapshot(input: {
  rentalId: string;
  surface: MeetupCoordinationSurface;
  rental: RentalMeetupRow;
  requestSchedulingMeta?: unknown;
  viewerUserId?: string | null;
  pickupHandoffComplete?: boolean;
  lifecyclePhase?: string;
  revision?: number;
}) {
  const viewerRole =
    input.viewerUserId && input.viewerUserId === input.rental.owner_user_id ? 'owner' : 'renter';
  const state = resolveCanonicalMeetupCoordinationState({
    rental: input.rental,
    viewerUserId: input.viewerUserId ?? null,
    viewerRole,
    presentationSurface: presentationSurfaceFromLegacy(
      input.surface,
      input.rental,
      input.viewerUserId
    ),
    requestSchedulingMeta: input.requestSchedulingMeta,
    pickupHandoffComplete: input.pickupHandoffComplete,
    revision: input.revision,
  });
  const driftSurface: import('@/lib/canonicalMeetupCoordination').CanonicalMeetupCoordinationDriftSurface =
    input.surface === 'wizard' || input.surface === 'workspace_phase_lanes'
      ? 'renter_wizard'
      : input.surface === 'workspace'
        ? 'owner_workspace'
        : input.surface === 'activity'
          ? 'activity'
          : input.surface === 'home_card'
            ? 'home_card'
            : 'chat';
  recordCanonicalMeetupCoordinationSnapshot({
    rentalId: input.rentalId,
    surface: driftSurface,
    state,
    lifecyclePhase: input.lifecyclePhase,
  });
  return state.lanes;
}

export { recordCanonicalMeetupCoordinationSnapshot, resolveCanonicalMeetupCoordinationState } from '@/lib/canonicalMeetupCoordination';

/** Compare cross-surface schedule resolution — DEV only. */
export function logRentalLifecycleDrift(
  rentalId: string,
  extra?: { trigger?: string }
): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;

  const surfaces = driftByRental.get(rentalId);
  if (!surfaces || surfaces.size === 0) return;

  const wizard = surfaces.get('wizard');
  const workspace = surfaces.get('workspace');
  const workspaceLanes = surfaces.get('workspace_phase_lanes');
  const chat = surfaces.get('chat');
  const activity = surfaces.get('activity');
  const home = surfaces.get('home_card');

  const pick = (s: DriftSurfaceRecord | undefined, field: keyof DriftSurfaceRecord) =>
    s?.[field] ?? null;

  const returnIsos = [
    wizard?.returnIso,
    workspace?.returnIso,
    chat?.returnIso,
    activity?.returnIso,
    home?.returnIso,
  ].filter((v) => v != null);
  const uniqueReturnIsos = new Set(returnIsos.map((v) => String(v)));

  logScenario('lifecycle', {
    event: 'rental_lifecycle_drift',
    tag: 'rental-lifecycle-drift',
    rentalId,
    trigger: extra?.trigger ?? 'compare',
    wizardResolvedReturnIso: pick(wizard, 'returnIso'),
    workspaceResolvedReturnIso: pick(workspace, 'returnIso'),
    chatResolvedReturnIso: pick(chat, 'returnIso'),
    activityResolvedReturnIso: pick(activity, 'returnIso'),
    homeResolvedReturnIso: pick(home, 'returnIso'),
    agreedReturnIso: pick(wizard, 'agreedReturnIso') ?? pick(workspace, 'agreedReturnIso'),
    operationalReturnIso: pick(wizard, 'operationalReturnIso') ?? pick(workspace, 'operationalReturnIso'),
    renderedReturnIso: pick(workspace, 'returnIso') ?? pick(wizard, 'returnIso'),
    wizardResolvedPickupIso: pick(wizard, 'pickupIso'),
    workspaceResolvedPickupIso: pick(workspace, 'pickupIso'),
    chatResolvedPickupIso: pick(chat, 'pickupIso'),
    lifecyclePhase: pick(wizard, 'lifecyclePhase'),
    returnCoordinationComplete: pick(wizard, 'returnCoordinationComplete'),
    last_proposed_by: pick(wizard, 'last_proposed_by') ?? pick(workspace, 'last_proposed_by'),
    agreement_status: pick(wizard, 'agreement_status') ?? pick(workspace, 'agreement_status'),
    return_confirmed_seen: pick(wizard, 'return_confirmed_seen'),
    returnSourceBySurface: {
      wizard: pick(wizard, 'returnSource'),
      workspace: pick(workspace, 'returnSource'),
      chat: pick(chat, 'returnSource'),
      activity: pick(activity, 'returnSource'),
      home: pick(home, 'returnSource'),
    },
    resolverBySurface: {
      wizard: pick(wizard, 'resolver'),
      workspace: pick(workspace, 'resolver'),
      workspace_phase_lanes: pick(workspaceLanes, 'resolver'),
      chat: pick(chat, 'resolver'),
      activity: pick(activity, 'resolver'),
      home: pick(home, 'resolver'),
    },
    workspaceReturnLaneStatus: pick(workspaceLanes, 'returnLaneStatus'),
    workspacePickupLaneStatus: pick(workspaceLanes, 'pickupLaneStatus'),
    workspacePendingPhase: pick(workspaceLanes, 'pendingPhase'),
    returnIsoDriftDetected: uniqueReturnIsos.size > 1,
  });
}

export function clearMeetupCoordinationDriftSnapshots(rentalId: string): void {
  driftByRental.delete(rentalId);
}

// Re-export display schedule for convenience (single import path).
export {
  resolveMeetupDisplaySchedule,
  logRentalMeetupRender,
  rentalHasPendingMeetupProposal,
  type RentalMeetupRowLike,
  type ResolvedMeetupDisplaySchedule,
  type MeetupDisplayRenderSource,
} from '@/lib/rentalMeetupDisplaySchedule';
