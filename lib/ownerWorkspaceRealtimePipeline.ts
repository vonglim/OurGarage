import type { RentalsLiveUpdateResult } from '@/lib/rentalLifecycle/rentalRowLivePatch';
import {
  coordinationFieldDigest,
  meetupCoordinationFieldsDiffer,
  meetupCoordinationPatchFromRow,
  rentalMeetupProposalIsNewer,
} from '@/lib/rentalMeetupCoordinationLive';

export type OwnerWorkspaceHydrationSource =
  | 'realtime_patch'
  | 'unified_store'
  | 'queued_realtime_patch';

export type OwnerWorkspaceRealtimePipelineStage =
  | 'raw_received'
  | 'handler_enter'
  | 'parse_accept'
  | 'parse_reject'
  | 'synthetic_baseline_patch'
  | 'live_patch_handler_invoked'
  | 'set_state_updater_enter'
  | 'set_state_prev_null_queued'
  | 'set_state_merge'
  | 'set_state_commit'
  | 'set_state_commit_digest'
  | 'set_state_skipped_same_row'
  | 'unified_store_candidate'
  | 'unified_store_apply'
  | 'unified_store_skip'
  | 'queued_patch_flush'
  | 'debounced_refresh_scheduled';

export function logOwnerWorkspaceRealtimePipeline(
  stage: OwnerWorkspaceRealtimePipelineStage,
  data: Record<string, unknown>
): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  console.log('[owner-workspace-realtime-pipeline]', { stage, ...data });
}

export function buildLiveUpdateFromRentalRow(
  row: Record<string, unknown>,
  changedFields: string[]
): RentalsLiveUpdateResult {
  return {
    patch: meetupCoordinationPatchFromRow(row),
    presenceChanged: false,
    coordinationChanged: true,
    coordinationChangedFields: changedFields,
    requiresImmediateRefresh: true,
  };
}

/** Whether a unified-store row should hydrate the mounted owner details rental state. */
export function shouldHydrateOwnerWorkspaceFromUnifiedRow(
  current: Record<string, unknown> | null | undefined,
  unified: Record<string, unknown>
): { apply: boolean; reason: string } {
  if (!current) {
    return { apply: false, reason: 'no_current_rental_row' };
  }
  if (String(current.id ?? '') !== String(unified.id ?? '')) {
    return { apply: false, reason: 'rental_id_mismatch' };
  }
  if (!meetupCoordinationFieldsDiffer(current, unified)) {
    return { apply: false, reason: 'no_coordination_field_delta' };
  }
  const unifiedNewer = rentalMeetupProposalIsNewer(unified, current);
  const currentNewer = rentalMeetupProposalIsNewer(current, unified);
  if (unifiedNewer) {
    return { apply: true, reason: 'unified_proposal_newer' };
  }
  if (currentNewer) {
    return { apply: false, reason: 'current_proposal_newer_than_unified' };
  }
  return { apply: true, reason: 'same_version_coordination_field_delta' };
}

export type QueuedOwnerWorkspaceLivePatch = {
  live: RentalsLiveUpdateResult;
  meta: { triggerSource: string; receivedAt: number; table: string };
  hydrationSource: OwnerWorkspaceHydrationSource;
};

export function buildCoordinationHydrationKey(row: Record<string, unknown>): string {
  return `${row.proposal_version ?? 0}:${row.last_proposed_by ?? ''}:${row.meetup_time ?? ''}:${row.pickup_datetime ?? ''}:${row.return_datetime ?? ''}`;
}

export function resolveOwnerWorkspaceCommitDecision(input: {
  hasPrev: boolean;
  returnedSameReference: boolean;
  rowFieldsChanged: boolean;
  keepBaselineCoordination: boolean | null;
  mergeAcceptanceReason: string | null;
  hydrationSource: OwnerWorkspaceHydrationSource;
  previousDigest: string | null;
  incomingDigest: string | null;
  finalDigest: string | null;
}): { returnValue: 'prev' | 'next'; reason: string } {
  if (!input.hasPrev) {
    return { returnValue: 'prev', reason: 'no_prev_row_state_updater_queued_patch' };
  }
  if (input.returnedSameReference) {
    if (input.previousDigest !== input.finalDigest) {
      return {
        returnValue: 'prev',
        reason: 'same_reference_despite_digest_delta_bug',
      };
    }
    return { returnValue: 'prev', reason: 'returned_same_reference_as_prev' };
  }
  if (input.keepBaselineCoordination) {
    return {
      returnValue: 'next',
      reason: `merge_kept_baseline:${input.mergeAcceptanceReason ?? 'unknown'}`,
    };
  }
  if (!input.rowFieldsChanged) {
    if (input.previousDigest === input.finalDigest) {
      return {
        returnValue: 'next',
        reason: 'new_reference_but_coordination_digest_unchanged',
      };
    }
    return {
      returnValue: 'next',
      reason: 'new_reference_no_coordination_field_delta',
    };
  }
  if (input.hydrationSource === 'unified_store') {
    return { returnValue: 'next', reason: 'unified_store_coordination_committed' };
  }
  return { returnValue: 'next', reason: 'coordination_row_committed' };
}

export function logOwnerWorkspaceHydrationCommit(input: {
  hydrationSource: OwnerWorkspaceHydrationSource;
  triggerSource: string;
  previousCoordinationDigest: string | null;
  incomingCoordinationDigest: string | null;
  patchCoordinationDigest: string | null;
  finalCommittedDigest: string | null;
  returnedSameReference: boolean;
  rowFieldsChanged: boolean;
  keepBaselineCoordination: boolean | null;
  mergeAcceptanceReason: string | null;
  commitDecision: { returnValue: 'prev' | 'next'; reason: string };
  proposalVersionBefore: unknown;
  proposalVersionAfter: unknown;
  shouldBumpRevision: boolean;
  bumpRevisionTo: number;
}): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  console.log('[owner-workspace-hydration-commit]', input);
  logOwnerWorkspaceRealtimePipeline('set_state_commit_digest', input);
}
