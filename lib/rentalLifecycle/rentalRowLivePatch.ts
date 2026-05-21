import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import {
  extractMeetupCoordinationRentalPatch,
  meetupCoordinationFieldsDiffer,
  meetupCoordinationPatchFromRow,
  type MeetupCoordinationRentalPatch,
} from '@/lib/rentalMeetupCoordinationLive';
import {
  extractPickupHandoffPresenceRentalPatch,
  type PickupHandoffPresenceRentalPatch,
} from '@/lib/pickupHandoffLive';

export type RentalRowLivePatch = PickupHandoffPresenceRentalPatch & MeetupCoordinationRentalPatch;

export type RentalsLiveUpdateResult = {
  patch: RentalRowLivePatch;
  presenceChanged: boolean;
  coordinationChanged: boolean;
  coordinationChangedFields: string[];
  requiresImmediateRefresh: boolean;
};

export type ParseRentalsLiveUpdateOptions = {
  /** In-memory rental row on the open details screen — used when payload.old is incomplete. */
  coordinationBaseline?: Record<string, unknown> | null;
  /** Emit `[owner-workspace-realtime-pipeline]` parse stages (DEV). */
  ownerWorkspacePipelineLog?: boolean;
  pipelineRentalId?: string | null;
};

/** Merge presence + coordination field deltas from a rentals UPDATE event. */
export function parseRentalsLiveUpdate(
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  options?: ParseRentalsLiveUpdateOptions
): RentalsLiveUpdateResult | null {
  if (payload.table !== 'rentals' || payload.eventType !== 'UPDATE') {
    if (options?.ownerWorkspacePipelineLog && typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[owner-workspace-realtime-pipeline]', {
        stage: 'parse_reject',
        reason: 'not_rentals_update',
        table: payload.table,
        eventType: payload.eventType,
        pipelineRentalId: options.pipelineRentalId ?? null,
      });
    }
    return null;
  }

  const presence = extractPickupHandoffPresenceRentalPatch(payload);
  let coordination = extractMeetupCoordinationRentalPatch(payload);
  const newRow = payload.new as Record<string, unknown> | undefined;
  const baseline = options?.coordinationBaseline;
  if (
    !coordination?.coordinationChanged &&
    baseline &&
    newRow &&
    meetupCoordinationFieldsDiffer(baseline, newRow)
  ) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[realtime-coordination-patch-extract]', {
        event: 'accept_baseline_row_diff',
        last_proposed_by: newRow.last_proposed_by ?? null,
        proposal_version: newRow.proposal_version ?? null,
      });
    }
    coordination = {
      patch: meetupCoordinationPatchFromRow(newRow),
      coordinationChanged: true,
      changedFields: ['baseline_row_diff'],
    };
  }

  if (!presence?.presenceChanged && !coordination?.coordinationChanged) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[realtime-rentals-live-parse]', {
        event: 'reject_no_live_delta',
        presenceChanged: presence?.presenceChanged ?? false,
        coordinationChanged: coordination?.coordinationChanged ?? false,
      });
      if (options?.ownerWorkspacePipelineLog) {
        console.log('[owner-workspace-realtime-pipeline]', {
          stage: 'parse_reject',
          reason: 'no_live_delta',
          pipelineRentalId: options.pipelineRentalId ?? null,
          hasBaseline: Boolean(options.coordinationBaseline),
          payloadRentalId: newRow?.id ?? null,
          baselineProposalVersion: options.coordinationBaseline?.proposal_version ?? null,
          payloadProposalVersion: newRow?.proposal_version ?? null,
        });
      }
    }
    return null;
  }

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[realtime-rentals-live-parse]', {
      event: 'accept',
      presenceChanged: Boolean(presence?.presenceChanged),
      coordinationChanged: Boolean(coordination?.coordinationChanged),
      coordinationChangedFields: coordination?.changedFields ?? [],
    });
    if (options?.ownerWorkspacePipelineLog) {
      console.log('[owner-workspace-realtime-pipeline]', {
        stage: 'parse_accept',
        pipelineRentalId: options.pipelineRentalId ?? null,
        presenceChanged: Boolean(presence?.presenceChanged),
        coordinationChanged: Boolean(coordination?.coordinationChanged),
        coordinationChangedFields: coordination?.changedFields ?? [],
      });
    }
  }

  return {
    patch: {
      ...(presence?.patch ?? {}),
      ...(coordination?.patch ?? {}),
    },
    presenceChanged: Boolean(presence?.presenceChanged),
    coordinationChanged: Boolean(coordination?.coordinationChanged),
    coordinationChangedFields: coordination?.changedFields ?? [],
    requiresImmediateRefresh: Boolean(presence?.presenceChanged || coordination?.coordinationChanged),
  };
}
