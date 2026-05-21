import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import {
  reconcileOperationalPickupIso,
  reconcileOperationalReturnIso,
} from '@/lib/rentalWizard/proposedMeetupSchedule';
import { resolveCanonicalMeetupCoordinationState } from '@/lib/canonicalMeetupCoordination';
import {
  mergeRentalWithCoordinationFreshness,
  type CoordinationFreshnessMeta,
} from '@/lib/meetupCoordinationFreshness';
import type {
  MeetupPhaseCoordinationLane,
  MeetupPhaseCoordinationStatus,
} from '@/lib/rentalMeetupPhaseCoordinationState';
import type { RentalMeetupRow } from '@/lib/rentalMeetupProposalLifecycle';
import type { RentalMeetupRowLike } from '@/lib/rentalMeetupDisplaySchedule';

/** Rental columns that drive meetup coordination lane UI. */
export const MEETUP_COORDINATION_RENTAL_FIELDS = [
  'agreement_status',
  'last_proposed_by',
  'status',
  'agreed_pickup_datetime',
  'agreed_return_datetime',
  'meetup_time',
  'pickup_datetime',
  'return_time',
  'return_datetime',
  'meetup_location',
  'return_location',
  'proposal_version',
  'proposal_updated_at',
  'latest_proposal_message_id',
  'owner_confirmed',
  'renter_confirmed',
  'confirmed_by_owner',
  'confirmed_by_renter',
] as const;

export type MeetupCoordinationRentalPatch = Partial<
  Record<
    Exclude<(typeof MEETUP_COORDINATION_RENTAL_FIELDS)[number], 'status'>,
    string | boolean | number | null
  >
> & {
  status?: string | null;
};

function fieldChanged(
  oldRow: Record<string, unknown> | undefined,
  newRow: Record<string, unknown> | undefined,
  key: string
): boolean {
  const o = oldRow?.[key];
  const n = newRow?.[key];
  return String(o ?? '') !== String(n ?? '');
}

export function coordinationFieldDigest(row: Record<string, unknown>): string {
  return MEETUP_COORDINATION_RENTAL_FIELDS.map((key) => `${key}=${String(row[key] ?? '')}`).join(
    '|'
  );
}

/** Full coordination column snapshot from a rentals row (avoids partial realtime deltas). */
export function meetupCoordinationPatchFromRow(
  row: Record<string, unknown>
): MeetupCoordinationRentalPatch {
  const patch: MeetupCoordinationRentalPatch = {};
  for (const key of MEETUP_COORDINATION_RENTAL_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
    const value = row[key];
    if (key === 'status') {
      if (typeof value === 'string' || value === null) {
        patch.status = value;
      }
      continue;
    }
    if (
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      typeof value === 'number' ||
      value === null
    ) {
      patch[key] = value as MeetupCoordinationRentalPatch[typeof key];
    }
  }
  return patch;
}

export function meetupCoordinationFieldsDiffer(
  a: Record<string, unknown> | null | undefined,
  b: Record<string, unknown> | null | undefined
): boolean {
  if (!a || !b) return a !== b;
  for (const key of MEETUP_COORDINATION_RENTAL_FIELDS) {
    if (String(a[key] ?? '') !== String(b[key] ?? '')) return true;
  }
  return false;
}

function logCoordinationPatchExtract(
  event: string,
  extra: Record<string, unknown>
): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  console.log('[realtime-coordination-patch-extract]', { event, ...extra });
}

export function extractMeetupCoordinationRentalPatch(
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>
): { patch: MeetupCoordinationRentalPatch; coordinationChanged: boolean; changedFields: string[] } | null {
  if (payload.table !== 'rentals' || payload.eventType !== 'UPDATE') {
    logCoordinationPatchExtract('reject_not_rentals_update', {
      table: payload.table,
      eventType: payload.eventType,
    });
    return null;
  }
  const oldRow = payload.old as Record<string, unknown> | undefined;
  const newRow = payload.new as Record<string, unknown> | undefined;
  if (!newRow) {
    logCoordinationPatchExtract('reject_missing_new_row', {});
    return null;
  }

  const changedFields: string[] = [];
  for (const key of MEETUP_COORDINATION_RENTAL_FIELDS) {
    if (fieldChanged(oldRow, newRow, key)) changedFields.push(key);
  }

  if (changedFields.length === 0) {
    const oldDigest = oldRow ? coordinationFieldDigest(oldRow) : '';
    const newDigest = coordinationFieldDigest(newRow);
    if (oldDigest !== newDigest) {
      logCoordinationPatchExtract('accept_digest_fallback', {
        oldDigest,
        newDigest,
        oldKeyCount: oldRow ? Object.keys(oldRow).length : 0,
      });
      return {
        patch: meetupCoordinationPatchFromRow(newRow),
        coordinationChanged: true,
        changedFields: ['digest_fallback'],
      };
    }
    logCoordinationPatchExtract('reject_no_changed_fields', {
      oldDigest,
      newDigest,
      last_proposed_by: newRow.last_proposed_by ?? null,
      proposal_version: newRow.proposal_version ?? null,
    });
    return null;
  }

  logCoordinationPatchExtract('accept_field_delta', {
    changedFields,
    last_proposed_by: newRow.last_proposed_by ?? null,
    proposal_version: newRow.proposal_version ?? null,
  });
  return {
    patch: meetupCoordinationPatchFromRow(newRow),
    coordinationChanged: true,
    changedFields,
  };
}

function viewerRoleForMeetupSnapshot(
  rental: RentalMeetupRowLike & Partial<Pick<RentalMeetupRow, 'owner_user_id' | 'renter_user_id'>>,
  viewerUserId?: string | null
): 'owner' | 'renter' {
  const uid = viewerUserId ?? '';
  if (uid && uid === rental.owner_user_id) return 'owner';
  if (uid && uid === rental.renter_user_id) return 'renter';
  return 'renter';
}

export function snapshotMeetupCoordinationStatuses(input: {
  rental: RentalMeetupRowLike &
    Partial<Pick<RentalMeetupRow, 'id' | 'owner_user_id' | 'renter_user_id' | 'status'>>;
  viewerUserId?: string | null;
  requestSchedulingMeta?: unknown;
  pickupHandoffComplete?: boolean;
  presentationSurface?: 'owner_workspace' | 'renter_wizard';
}): { pickupStatus: MeetupPhaseCoordinationStatus; returnStatus: MeetupPhaseCoordinationStatus } {
  const role = viewerRoleForMeetupSnapshot(input.rental, input.viewerUserId);
  const coordination = resolveCanonicalMeetupCoordinationState({
    rental: input.rental as RentalMeetupRow,
    viewerUserId: input.viewerUserId ?? null,
    viewerRole: role,
    presentationSurface:
      input.presentationSurface ?? (role === 'owner' ? 'owner_workspace' : 'renter_wizard'),
    requestSchedulingMeta: input.requestSchedulingMeta,
    pickupHandoffComplete: input.pickupHandoffComplete,
  });
  return {
    pickupStatus: coordination.pickup.status,
    returnStatus: coordination.return.status,
  };
}

export type ReturnCoordinationLiveDiagnostics = {
  previousReturnStatus: MeetupPhaseCoordinationStatus | null;
  nextReturnStatus: MeetupPhaseCoordinationStatus;
  proposed_return_datetime: string | null;
  pendingReturnProposalIso: string | null;
  agreed_return_datetime: string | null;
  returnLastProposedBy: string | null;
  derivedReturnLaneState: MeetupPhaseCoordinationLane;
  pendingPhase: string | null;
  globalHasPendingProposal: boolean;
};

export function buildReturnCoordinationLiveDiagnostics(input: {
  rental: RentalMeetupRowLike &
    Partial<Pick<RentalMeetupRow, 'id' | 'owner_user_id' | 'renter_user_id' | 'status'>>;
  viewerUserId?: string | null;
  requestSchedulingMeta?: unknown;
  pickupHandoffComplete?: boolean;
  previousReturnStatus?: MeetupPhaseCoordinationStatus | null;
}): ReturnCoordinationLiveDiagnostics {
  const role = viewerRoleForMeetupSnapshot(input.rental, input.viewerUserId);
  const coordination = resolveCanonicalMeetupCoordinationState({
    rental: input.rental as RentalMeetupRow,
    viewerUserId: input.viewerUserId ?? null,
    viewerRole: role,
    presentationSurface: role === 'owner' ? 'owner_workspace' : 'renter_wizard',
    requestSchedulingMeta: input.requestSchedulingMeta,
    pickupHandoffComplete: input.pickupHandoffComplete,
  });
  const returnReconciled = reconcileOperationalReturnIso(input.rental);
  return {
    previousReturnStatus: input.previousReturnStatus ?? null,
    nextReturnStatus: coordination.return.status,
    proposed_return_datetime: returnReconciled.iso,
    pendingReturnProposalIso: coordination.schedule.pendingReturnProposalIso,
    agreed_return_datetime: input.rental.agreed_return_datetime?.trim() ?? null,
    returnLastProposedBy: String(input.rental.last_proposed_by ?? '').trim() || null,
    derivedReturnLaneState: coordination.return,
    pendingPhase: coordination.pendingPhase,
    globalHasPendingProposal: coordination.globalHasPendingProposal,
  };
}

export function logPickupCoordinationLiveReturn(input: {
  rentalId: string;
  triggerSource: string;
  triggeredBy: string;
  changedFields: string[];
  latencyMs: number;
  surface: string;
  diagnostics: ReturnCoordinationLiveDiagnostics;
}): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  const d = input.diagnostics;
  console.log('[pickup-coordination-live-return]', {
    rentalId: input.rentalId,
    triggerSource: input.triggerSource,
    triggeredBy: input.triggeredBy,
    changedFields: input.changedFields,
    latencyMs: input.latencyMs,
    surface: input.surface,
    previousReturnStatus: d.previousReturnStatus,
    nextReturnStatus: d.nextReturnStatus,
    proposed_return_datetime: d.proposed_return_datetime,
    pendingReturnProposalIso: d.pendingReturnProposalIso,
    agreed_return_datetime: d.agreed_return_datetime,
    returnLastProposedBy: d.returnLastProposedBy,
    derivedReturnLaneState: {
      status: d.derivedReturnLaneState.status,
      statusLabel: d.derivedReturnLaneState.statusLabel,
      unlocked: d.derivedReturnLaneState.unlocked,
      isPendingThisPhase: d.derivedReturnLaneState.isPendingThisPhase,
      viewerCanAccept: d.derivedReturnLaneState.viewerCanAccept,
      viewerCanPropose: d.derivedReturnLaneState.viewerCanPropose,
      viewerCanModify: d.derivedReturnLaneState.viewerCanModify,
      viewerCanDecline: d.derivedReturnLaneState.viewerCanDecline,
    },
    pendingPhase: d.pendingPhase,
    globalHasPendingProposal: d.globalHasPendingProposal,
  });
}

/** Copy meetup coordination columns from `source` onto `base` (live patch wins over stale fetch). */
export function applyMeetupCoordinationFieldsFrom<
  T extends Record<string, unknown>,
  S extends Record<string, unknown>,
>(base: T, source: S): T & S {
  const out = { ...base } as T & S;
  for (const key of MEETUP_COORDINATION_RENTAL_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      (out as Record<string, unknown>)[key] = source[key];
    }
  }
  return out;
}

export function rentalMeetupProposalIsNewer(
  candidate: { proposal_version?: number | null; proposal_updated_at?: string | null },
  baseline: { proposal_version?: number | null; proposal_updated_at?: string | null }
): boolean {
  const candV = Number(candidate.proposal_version ?? 0);
  const baseV = Number(baseline.proposal_version ?? 0);
  if (candV !== baseV) return candV > baseV;
  const candT = Date.parse(String(candidate.proposal_updated_at ?? '')) || 0;
  const baseT = Date.parse(String(baseline.proposal_updated_at ?? '')) || 0;
  return candT > baseT;
}

export function mergeRentalRowPreferringNewerMeetupCoordination<
  T extends Record<string, unknown>,
>(
  fresh: T,
  prev: T | null | undefined,
  options?: {
    baselineMeta?: CoordinationFreshnessMeta | null;
    coordinationRevision?: number;
  }
): T {
  const result = mergeRentalWithCoordinationFreshness({
    incoming: fresh,
    baseline: prev,
    incomingSource: 'fetch_refresh',
    baselineMeta: options?.baselineMeta,
    coordinationRevision: options?.coordinationRevision,
  });
  return result.merged;
}

export function logMeetupCoordinationWorkspacePatch(input: {
  rentalId: string;
  triggerSource: string;
  changedFields: string[];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  derivedPickupStatus: MeetupPhaseCoordinationStatus;
  derivedReturnStatus: MeetupPhaseCoordinationStatus;
  pendingPhase: string | null;
}): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  const beforePickup = reconcileOperationalPickupIso(input.before as RentalMeetupRowLike).iso;
  const afterPickup = reconcileOperationalPickupIso(input.after as RentalMeetupRowLike).iso;
  console.log('[meetup-coordination-live-patch]', {
    rentalId: input.rentalId,
    triggerSource: input.triggerSource,
    changedFields: input.changedFields,
    agreement_status_before: input.before.agreement_status ?? null,
    agreement_status_after: input.after.agreement_status ?? null,
    last_proposed_by_before: input.before.last_proposed_by ?? null,
    last_proposed_by_after: input.after.last_proposed_by ?? null,
    proposed_pickup_before: beforePickup,
    proposed_pickup_after: afterPickup,
    pickup_datetime_before: input.before.pickup_datetime ?? input.before.meetup_time ?? null,
    pickup_datetime_after: input.after.pickup_datetime ?? input.after.meetup_time ?? null,
    proposal_version_before: input.before.proposal_version ?? null,
    proposal_version_after: input.after.proposal_version ?? null,
    derivedPickupStatus: input.derivedPickupStatus,
    derivedReturnStatus: input.derivedReturnStatus,
    pendingPhase: input.pendingPhase,
  });
}

export function logMeetupCoordinationRenderInputs(input: {
  rentalId: string;
  rental: RentalMeetupRowLike;
  viewerUserId: string | null;
  coordinationRevision: number;
  meetupPhaseCoordination?: {
    pickup: { status: string };
    return: { status: string };
    pendingPhase: string | null;
  } | null;
}): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  const proposedPickup = reconcileOperationalPickupIso(input.rental).iso;
  const proposedReturn = reconcileOperationalReturnIso(input.rental).iso;
  console.log('[meetup-coordination-render]', {
    rentalId: input.rentalId,
    coordinationRevision: input.coordinationRevision,
    agreement_status: input.rental.agreement_status ?? null,
    last_proposed_by: input.rental.last_proposed_by ?? null,
    proposed_pickup_datetime: proposedPickup,
    proposed_return_datetime: proposedReturn,
    pickup_datetime: input.rental.pickup_datetime ?? null,
    return_datetime: input.rental.return_datetime ?? null,
    meetup_time: input.rental.meetup_time ?? null,
    return_time: input.rental.return_time ?? null,
    agreed_pickup_datetime: input.rental.agreed_pickup_datetime ?? null,
    agreed_return_datetime: input.rental.agreed_return_datetime ?? null,
    proposal_version:
      (input.rental as RentalMeetupRowLike & { proposal_version?: number | null }).proposal_version ??
      null,
    viewerUserId: input.viewerUserId,
    'meetupPhaseCoordination.return.status':
      input.meetupPhaseCoordination?.return.status ?? null,
    returnLaneStatus: input.meetupPhaseCoordination?.return.status ?? null,
    'meetupPhaseCoordination.pickup.status':
      input.meetupPhaseCoordination?.pickup.status ?? null,
    pendingPhase: input.meetupPhaseCoordination?.pendingPhase ?? null,
  });
}

export function logPickupCoordinationLive(input: {
  rentalId: string;
  triggerSource: string;
  triggeredBy: string;
  changedFields: string[];
  previousPickupStatus: MeetupPhaseCoordinationStatus | null;
  nextPickupStatus: MeetupPhaseCoordinationStatus;
  previousReturnStatus: MeetupPhaseCoordinationStatus | null;
  nextReturnStatus: MeetupPhaseCoordinationStatus;
  latencyMs: number;
  surface: string;
}): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  console.log('[pickup-coordination-live]', {
    rentalId: input.rentalId,
    triggerSource: input.triggerSource,
    triggeredBy: input.triggeredBy,
    changedFields: input.changedFields,
    previousPickupStatus: input.previousPickupStatus,
    nextPickupStatus: input.nextPickupStatus,
    previousReturnStatus: input.previousReturnStatus,
    nextReturnStatus: input.nextReturnStatus,
    latencyMs: input.latencyMs,
    surface: input.surface,
  });
}
