import {
  applyMeetupCoordinationFieldsFrom,
  MEETUP_COORDINATION_RENTAL_FIELDS,
  meetupCoordinationFieldsDiffer,
  meetupCoordinationPatchFromRow,
  rentalMeetupProposalIsNewer,
} from '@/lib/rentalMeetupCoordinationLive';
import { reconcileOperationalPickupIso, reconcileOperationalReturnIso } from '@/lib/rentalWizard/proposedMeetupSchedule';

export type CoordinationFreshnessSource = 'realtime_patch' | 'optimistic_local' | 'fetch_refresh';

export type CoordinationFreshnessMeta = {
  proposal_version: number;
  proposal_updated_at: string | null;
  coordination_revision: number;
  source: CoordinationFreshnessSource;
};

export type CoordinationFreshnessAcceptanceContext = {
  viewerUserId?: string | null;
  pickupHandoffComplete?: boolean;
  requestSchedulingMeta?: unknown;
};

function sourceRank(source: CoordinationFreshnessSource): number {
  switch (source) {
    case 'realtime_patch':
      return 3;
    case 'optimistic_local':
      return 2;
    case 'fetch_refresh':
      return 1;
    default:
      return 0;
  }
}

export function extractCoordinationFreshnessMeta(
  row: Record<string, unknown>,
  overrides?: Partial<CoordinationFreshnessMeta>
): CoordinationFreshnessMeta {
  return {
    proposal_version: Number(row.proposal_version ?? 0),
    proposal_updated_at:
      typeof row.proposal_updated_at === 'string' ? row.proposal_updated_at : null,
    coordination_revision: overrides?.coordination_revision ?? 0,
    source: overrides?.source ?? 'fetch_refresh',
    ...overrides,
  };
}

function coordinationFieldDigest(row: Record<string, unknown>): string {
  return MEETUP_COORDINATION_RENTAL_FIELDS.map((key) => `${key}=${String(row[key] ?? '')}`).join(
    '|'
  );
}

export function patchContainsMeetupCoordinationFields(patch: Record<string, unknown>): boolean {
  return MEETUP_COORDINATION_RENTAL_FIELDS.some((key) =>
    Object.prototype.hasOwnProperty.call(patch, key)
  );
}

export function coordinationFreshnessScore(
  meta: CoordinationFreshnessMeta,
  row?: Record<string, unknown>
): number {
  const pickupMs = row ? Date.parse(reconcileOperationalPickupIso(row).iso ?? '') || 0 : 0;
  const returnMs = row ? Date.parse(reconcileOperationalReturnIso(row).iso ?? '') || 0 : 0;
  const updatedAt = Date.parse(meta.proposal_updated_at ?? '') || 0;
  return (
    meta.proposal_version * 1e15 +
    updatedAt * 1e3 +
    pickupMs +
    returnMs * 0.001 +
    meta.coordination_revision
  );
}

type CoordinationAcceptanceDecision = {
  keepBaselineCoordination: boolean;
  rejectionReason: string;
};

function decideCoordinationMerge(input: {
  baselineMeta: CoordinationFreshnessMeta;
  incomingMeta: CoordinationFreshnessMeta;
  baseline: Record<string, unknown>;
  incoming: Record<string, unknown>;
}): CoordinationAcceptanceDecision {
  const { baselineMeta, incomingMeta, baseline, incoming } = input;
  const fieldsDiffer = meetupCoordinationFieldsDiffer(baseline, incoming);

  if (!fieldsDiffer) {
    return { keepBaselineCoordination: true, rejectionReason: 'no_coordination_field_delta' };
  }

  const incomingStrictlyOlder =
    rentalMeetupProposalIsNewer(baseline, incoming) && !rentalMeetupProposalIsNewer(incoming, baseline);
  const incomingStrictlyNewer =
    rentalMeetupProposalIsNewer(incoming, baseline) && !rentalMeetupProposalIsNewer(baseline, incoming);

  if (incomingMeta.source === 'realtime_patch') {
    if (incomingStrictlyOlder) {
      return { keepBaselineCoordination: true, rejectionReason: 'realtime_strictly_older_than_baseline' };
    }
    return {
      keepBaselineCoordination: false,
      rejectionReason: incomingStrictlyNewer
        ? 'realtime_patch_newer_proposal'
        : 'realtime_patch_semantic_delta_same_version',
    };
  }

  if (incomingMeta.source === 'optimistic_local') {
    if (incomingStrictlyOlder) {
      return { keepBaselineCoordination: true, rejectionReason: 'optimistic_strictly_older_than_baseline' };
    }
    return {
      keepBaselineCoordination: false,
      rejectionReason: 'optimistic_local_semantic_delta',
    };
  }

  if (incomingMeta.source === 'fetch_refresh') {
    if (
      baselineMeta.source === 'realtime_patch' ||
      baselineMeta.source === 'optimistic_local'
    ) {
      if (incomingStrictlyNewer) {
        return { keepBaselineCoordination: false, rejectionReason: 'fetch_newer_than_local_baseline' };
      }
      return {
        keepBaselineCoordination: true,
        rejectionReason: 'fetch_blocked_by_local_first_baseline',
      };
    }
  }

  const baselineScore = coordinationFreshnessScore(baselineMeta, baseline);
  const incomingScore = coordinationFreshnessScore(incomingMeta, incoming);
  if (baselineScore > incomingScore) {
    return { keepBaselineCoordination: true, rejectionReason: 'baseline_score_higher' };
  }
  if (incomingScore > baselineScore) {
    return { keepBaselineCoordination: false, rejectionReason: 'incoming_score_higher' };
  }

  const baselineRank = sourceRank(baselineMeta.source);
  const incomingRank = sourceRank(incomingMeta.source);
  if (baselineRank > incomingRank) {
    return { keepBaselineCoordination: true, rejectionReason: 'baseline_source_rank_higher' };
  }
  if (incomingRank > baselineRank) {
    return { keepBaselineCoordination: false, rejectionReason: 'incoming_source_rank_higher' };
  }

  if (incomingStrictlyOlder) {
    return { keepBaselineCoordination: true, rejectionReason: 'tie_incoming_strictly_older' };
  }

  return { keepBaselineCoordination: false, rejectionReason: 'tie_default_accept_incoming' };
}

export function logCoordinationFreshnessAcceptance(input: {
  incomingSource: CoordinationFreshnessSource;
  incomingRevision: number;
  currentRevision: number;
  incomingProposalVersion: number;
  currentProposalVersion: number;
  incomingLastProposedBy: string | null;
  currentLastProposedBy: string | null;
  incomingPickupIso: string | null;
  currentPickupIso: string | null;
  incomingReturnIso: string | null;
  currentReturnIso: string | null;
  accepted: boolean;
  rejectionReason: string;
  coordinationFieldsDiffer: boolean;
  surface?: string;
}): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  console.log('[coordination-freshness-acceptance]', {
    surface: input.surface ?? null,
    incomingSource: input.incomingSource,
    incomingRevision: input.incomingRevision,
    currentRevision: input.currentRevision,
    incomingProposalVersion: input.incomingProposalVersion,
    currentProposalVersion: input.currentProposalVersion,
    incomingLastProposedBy: input.incomingLastProposedBy,
    currentLastProposedBy: input.currentLastProposedBy,
    incomingPickupIso: input.incomingPickupIso,
    currentPickupIso: input.currentPickupIso,
    incomingReturnIso: input.incomingReturnIso,
    currentReturnIso: input.currentReturnIso,
    coordinationFieldsDiffer: input.coordinationFieldsDiffer,
    accepted: input.accepted,
    rejectionReason: input.rejectionReason,
  });
}

export type MergeRentalWithCoordinationFreshnessResult<T> = {
  merged: T;
  meta: CoordinationFreshnessMeta;
  coordinationChanged: boolean;
  rejectedStaleFetchDowngrade: boolean;
  shouldBumpRevision: boolean;
  acceptanceReason: string;
};

export function mergeRentalWithCoordinationFreshness<T extends Record<string, unknown>>(input: {
  incoming: T;
  baseline: T | null | undefined;
  incomingSource: CoordinationFreshnessSource;
  baselineMeta?: CoordinationFreshnessMeta | null;
  coordinationRevision?: number;
  surface?: string;
}): MergeRentalWithCoordinationFreshnessResult<T> {
  const coordinationRevision = input.coordinationRevision ?? 0;
  const baselineMeta =
    input.baselineMeta ??
    (input.baseline ? extractCoordinationFreshnessMeta(input.baseline) : null);

  if (!input.baseline) {
    const meta = extractCoordinationFreshnessMeta(input.incoming, {
      source: input.incomingSource,
      coordination_revision: coordinationRevision + 1,
    });
    logCoordinationFreshnessAcceptance({
      incomingSource: input.incomingSource,
      incomingRevision: meta.coordination_revision,
      currentRevision: coordinationRevision,
      incomingProposalVersion: meta.proposal_version,
      currentProposalVersion: 0,
      incomingLastProposedBy: String(input.incoming.last_proposed_by ?? '') || null,
      currentLastProposedBy: null,
      incomingPickupIso: reconcileOperationalPickupIso(input.incoming).iso,
      currentPickupIso: null,
      incomingReturnIso: reconcileOperationalReturnIso(input.incoming).iso,
      currentReturnIso: null,
      coordinationFieldsDiffer: true,
      accepted: true,
      rejectionReason: 'no_baseline_row',
      surface: input.surface,
    });
    return {
      merged: input.incoming,
      meta,
      coordinationChanged: true,
      rejectedStaleFetchDowngrade: false,
      shouldBumpRevision: true,
      acceptanceReason: 'no_baseline_row',
    };
  }

  const fieldsDiffer = meetupCoordinationFieldsDiffer(input.baseline, input.incoming);
  const nextIncomingRevision =
    input.incomingSource === 'realtime_patch' || input.incomingSource === 'optimistic_local'
      ? Math.max(coordinationRevision, baselineMeta?.coordination_revision ?? 0) +
        (fieldsDiffer ? 1 : 0)
      : coordinationRevision;

  const incomingMeta = extractCoordinationFreshnessMeta(input.incoming, {
    source: input.incomingSource,
    coordination_revision: nextIncomingRevision,
  });

  const decision = decideCoordinationMerge({
    baselineMeta: baselineMeta!,
    incomingMeta,
    baseline: input.baseline,
    incoming: input.incoming,
  });
  const keepBaselineCoordination = decision.keepBaselineCoordination;

  const shell = { ...input.baseline, ...input.incoming };
  const merged = (
    keepBaselineCoordination
      ? applyMeetupCoordinationFieldsFrom(shell, input.baseline)
      : applyMeetupCoordinationFieldsFrom(shell, input.incoming)
  ) as T;

  const coordinationChanged = meetupCoordinationFieldsDiffer(input.baseline, merged);
  const shouldBumpRevision = coordinationChanged && !keepBaselineCoordination;
  const nextRevision = shouldBumpRevision
    ? Math.max(nextIncomingRevision, (baselineMeta?.coordination_revision ?? 0) + 1)
    : baselineMeta?.coordination_revision ?? coordinationRevision;
  const winningSource = keepBaselineCoordination ? baselineMeta!.source : incomingMeta.source;

  const meta = extractCoordinationFreshnessMeta(merged, {
    source: winningSource,
    coordination_revision: nextRevision,
  });

  const rejectedStaleFetchDowngrade =
    input.incomingSource === 'fetch_refresh' && keepBaselineCoordination && fieldsDiffer;

  logCoordinationFreshnessAcceptance({
    incomingSource: input.incomingSource,
    incomingRevision: incomingMeta.coordination_revision,
    currentRevision: baselineMeta?.coordination_revision ?? coordinationRevision,
    incomingProposalVersion: incomingMeta.proposal_version,
    currentProposalVersion: baselineMeta?.proposal_version ?? 0,
    incomingLastProposedBy: String(input.incoming.last_proposed_by ?? '') || null,
    currentLastProposedBy: String(input.baseline.last_proposed_by ?? '') || null,
    incomingPickupIso: reconcileOperationalPickupIso(input.incoming).iso,
    currentPickupIso: reconcileOperationalPickupIso(input.baseline).iso,
    incomingReturnIso: reconcileOperationalReturnIso(input.incoming).iso,
    currentReturnIso: reconcileOperationalReturnIso(input.baseline).iso,
    coordinationFieldsDiffer: fieldsDiffer,
    accepted: !keepBaselineCoordination,
    rejectionReason: decision.rejectionReason,
    surface: input.surface,
  });

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[coordination-freshness-merge]', {
      surface: input.surface ?? null,
      incomingSource: input.incomingSource,
      baselineSource: baselineMeta?.source ?? null,
      winningSource,
      keepBaselineCoordination,
      rejectedStaleFetchDowngrade,
      coordinationChanged,
      shouldBumpRevision,
      acceptanceReason: decision.rejectionReason,
      baselineVersion: baselineMeta?.proposal_version ?? null,
      incomingVersion: incomingMeta.proposal_version,
      mergedVersion: meta.proposal_version,
      baselineUpdatedAt: baselineMeta?.proposal_updated_at ?? null,
      incomingUpdatedAt: incomingMeta.proposal_updated_at,
      coordinationRevision: nextRevision,
    });
  }

  return {
    merged,
    meta,
    coordinationChanged,
    rejectedStaleFetchDowngrade,
    shouldBumpRevision,
    acceptanceReason: decision.rejectionReason,
  };
}

/** Apply a realtime rentals patch as a full coordination snapshot merge. */
export function mergeRentalRowFromRealtimeCoordinationPatch<T extends Record<string, unknown>>(input: {
  baseline: T;
  patch: Record<string, unknown>;
  baselineMeta?: CoordinationFreshnessMeta | null;
  coordinationRevision?: number;
  surface?: string;
}): MergeRentalWithCoordinationFreshnessResult<T> {
  const incomingRow = meetupCoordinationPatchFromRow({
    ...input.baseline,
    ...input.patch,
  });
  return mergeRentalWithCoordinationFreshness({
    incoming: { ...input.baseline, ...incomingRow } as T,
    baseline: input.baseline,
    incomingSource: 'realtime_patch',
    baselineMeta: input.baselineMeta,
    coordinationRevision: input.coordinationRevision,
    surface: input.surface,
  });
}
