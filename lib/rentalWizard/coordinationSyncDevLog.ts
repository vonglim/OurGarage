import type { RentalWizardContext } from '@/lib/rentalWizard/types';

export type CoordinationSyncTraceStage =
  | 'realtime_received'
  | 'realtime_parsed'
  | 'freshness_merge'
  | 'wizard_layout_ctx'
  | 'build_context'
  | 'wizard_provider_ctx'
  | 'coordinate_pickup_render';

export function logCoordinationSyncTrace(
  stage: CoordinationSyncTraceStage,
  payload: Record<string, unknown>
): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  console.log(`[coordination-sync-trace][${stage}]`, {
    ts: new Date().toISOString(),
    ...payload,
  });
}

export function coordinationSyncSnapshotFromRow(
  rental: Record<string, unknown> | null | undefined,
  meetupCoordination?: RentalWizardContext['meetupCoordination'] | null
) {
  return {
    pickup_datetime: rental?.pickup_datetime ?? null,
    meetup_location: rental?.meetup_location ?? null,
    meetup_time: rental?.meetup_time ?? null,
    last_proposed_by: rental?.last_proposed_by ?? null,
    proposal_version: rental?.proposal_version ?? null,
    agreement_status: rental?.agreement_status ?? null,
    pickupStatus: meetupCoordination?.pickup.status ?? null,
    pickupLaneLocation: meetupCoordination?.pickup.location ?? null,
    pickupLaneDateTimeIso: meetupCoordination?.pickup.dateTimeIso ?? null,
    pickupProposedByRole: meetupCoordination?.pickup.proposedByRole ?? null,
    pickupIsPending: meetupCoordination?.pickup.isPendingThisPhase ?? null,
    meetupCoordinationRevision: meetupCoordination?.revision ?? null,
    coordinationLiveRevision: meetupCoordination?.revision ?? null,
  };
}

export function coordinationSyncSnapshotFromCtx(ctx: RentalWizardContext) {
  return {
    rentalId: ctx.rentalId,
    viewerRole: ctx.viewerRole,
    ...coordinationSyncSnapshotFromRow(ctx.rental as Record<string, unknown>, ctx.meetupCoordination),
  };
}
