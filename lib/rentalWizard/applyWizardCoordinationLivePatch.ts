import {
  recomputeCanonicalMeetupCoordination,
  roleForViewerOnRental,
  type MeetupCoordinationPresentationSurface,
} from '@/lib/canonicalMeetupCoordination';
import {
  extractCoordinationFreshnessMeta,
  mergeRentalRowFromRealtimeCoordinationPatch,
  patchContainsMeetupCoordinationFields,
  type CoordinationFreshnessMeta,
} from '@/lib/meetupCoordinationFreshness';
import {
  buildReturnCoordinationLiveDiagnostics,
  logPickupCoordinationLive,
  logPickupCoordinationLiveReturn,
  meetupCoordinationFieldsDiffer,
  meetupCoordinationPatchFromRow,
  snapshotMeetupCoordinationStatuses,
} from '@/lib/rentalMeetupCoordinationLive';
import {
  logPickupHandoffLive,
  resolvePickupHandoffPresenceState,
  type LivePresencePhase,
} from '@/lib/pickupHandoffLive';
import type { RentalsLiveUpdateResult } from '@/lib/rentalLifecycle/rentalRowLivePatch';
import type { RentalMeetupRow } from '@/lib/rentalMeetupProposalLifecycle';
import {
  coordinationSyncSnapshotFromRow,
  logCoordinationSyncTrace,
} from '@/lib/rentalWizard/coordinationSyncDevLog';
import { logCoordinationRealtime } from '@/lib/rentalWizard/coordinationInstrumentation';
import { buildRentalWizardContextFlags } from '@/lib/rentalWizard/rentalWizardContextFlags';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';

export type WizardCoordinationPatchRefs = {
  freshness: CoordinationFreshnessMeta;
  revision: number;
  previousPickupStatus: string | null;
  previousReturnStatus: string | null;
  previousLivePhase: LivePresencePhase | null;
};

export type MergeWizardContextFromLivePatchInput = {
  prev: RentalWizardContext;
  live: RentalsLiveUpdateResult;
  triggerSource: string;
  receivedAt: number;
  rentalId: string;
  viewerUserId: string;
  presentationSurface: MeetupCoordinationPresentationSurface;
  surfaceLabel: string;
  refs: WizardCoordinationPatchRefs;
};

export type MergeWizardContextFromLivePatchResult = {
  next: RentalWizardContext;
  refs: WizardCoordinationPatchRefs;
  coordinationChanged: boolean;
};

export function mergeWizardContextFromRentalLivePatch(
  input: MergeWizardContextFromLivePatchInput
): MergeWizardContextFromLivePatchResult {
  const { prev, live, rentalId, viewerUserId, presentationSurface, surfaceLabel } = input;
  let refs = { ...input.refs };

  logCoordinationRealtime({
    event: 'received',
    rentalId,
    surface: surfaceLabel,
    triggerSource: input.triggerSource,
    coordinationChanged: live.coordinationChanged,
    coordinationChangedFields: live.coordinationChangedFields,
    proposal_version: live.patch.proposal_version ?? null,
  });

  logCoordinationSyncTrace('realtime_received', {
    surface: `${surfaceLabel}_handler`,
    triggerSource: input.triggerSource,
    rentalId,
    coordinationChanged: live.coordinationChanged,
    coordinationChangedFields: live.coordinationChangedFields,
    patchHasCoordinationFields: patchContainsMeetupCoordinationFields(live.patch),
    ...coordinationSyncSnapshotFromRow(live.patch as Record<string, unknown>),
  });

  const shouldMergeCoordination =
    live.coordinationChanged || patchContainsMeetupCoordinationFields(live.patch);
  const mergeResult = shouldMergeCoordination
    ? mergeRentalRowFromRealtimeCoordinationPatch({
        baseline: prev.rental,
        patch: live.patch,
        baselineMeta: refs.freshness,
        coordinationRevision: refs.revision,
        surface: surfaceLabel,
      })
    : null;
  const incomingShell = { ...prev.rental, ...live.patch } as typeof prev.rental;
  let nextRental = (mergeResult ? mergeResult.merged : incomingShell) as typeof prev.rental;
  let forceBumpRevision = mergeResult?.shouldBumpRevision ?? false;

  if (mergeResult) {
    logCoordinationSyncTrace('freshness_merge', {
      surface: surfaceLabel,
      triggerSource: input.triggerSource,
      acceptanceReason: mergeResult.acceptanceReason,
      shouldBumpRevision: mergeResult.shouldBumpRevision,
      coordinationChanged: mergeResult.coordinationChanged,
      before: coordinationSyncSnapshotFromRow(
        prev.rental as Record<string, unknown>,
        prev.meetupCoordination
      ),
      after: coordinationSyncSnapshotFromRow(mergeResult.merged as Record<string, unknown>, null),
      incomingShell: coordinationSyncSnapshotFromRow(incomingShell as Record<string, unknown>, null),
    });

    refs = { ...refs, freshness: mergeResult.meta };

    if (
      live.coordinationChanged &&
      !mergeResult.shouldBumpRevision &&
      !mergeResult.acceptanceReason.includes('no_coordination') &&
      meetupCoordinationFieldsDiffer(
        prev.rental as Record<string, unknown>,
        incomingShell as Record<string, unknown>
      )
    ) {
      const coordinationSnapshot = meetupCoordinationPatchFromRow(
        incomingShell as Record<string, unknown>
      );
      nextRental = { ...prev.rental, ...coordinationSnapshot } as typeof prev.rental;
      forceBumpRevision = true;
      const nextRevision = Math.max(refs.revision + 1, mergeResult.meta.coordination_revision);
      refs = {
        ...refs,
        freshness: extractCoordinationFreshnessMeta(nextRental as Record<string, unknown>, {
          source: 'realtime_patch',
          coordination_revision: nextRevision,
        }),
        revision: nextRevision,
      };
      logCoordinationSyncTrace('freshness_merge', {
        surface: surfaceLabel,
        triggerSource: input.triggerSource,
        event: 'forced_coordination_commit',
        nextRevision,
        ...coordinationSyncSnapshotFromRow(nextRental as Record<string, unknown>),
      });
    } else if (mergeResult.shouldBumpRevision) {
      refs = { ...refs, revision: mergeResult.meta.coordination_revision };
    }
  }

  const wizardFlags = buildRentalWizardContextFlags(nextRental);
  const prevCoord = snapshotMeetupCoordinationStatuses({
    rental: prev.rental,
    viewerUserId,
    requestSchedulingMeta: prev.requestSchedulingMeta,
    pickupHandoffComplete: prev.pickupHandoffComplete,
  });
  const nextCoord = snapshotMeetupCoordinationStatuses({
    rental: nextRental,
    viewerUserId,
    requestSchedulingMeta: prev.requestSchedulingMeta,
    pickupHandoffComplete: prev.pickupHandoffComplete,
  });

  if (live.coordinationChanged) {
    const previousReturnStatus =
      (refs.previousReturnStatus as typeof nextCoord.returnStatus) ?? prevCoord.returnStatus;
    logPickupCoordinationLive({
      rentalId,
      triggerSource: input.triggerSource,
      triggeredBy: String(nextRental.last_proposed_by ?? live.patch.last_proposed_by ?? ''),
      changedFields: live.coordinationChangedFields,
      previousPickupStatus:
        (refs.previousPickupStatus as typeof nextCoord.pickupStatus) ?? prevCoord.pickupStatus,
      nextPickupStatus: nextCoord.pickupStatus,
      previousReturnStatus,
      nextReturnStatus: nextCoord.returnStatus,
      latencyMs: Date.now() - input.receivedAt,
      surface: surfaceLabel,
    });
    logPickupCoordinationLiveReturn({
      rentalId,
      triggerSource: input.triggerSource,
      triggeredBy: String(nextRental.last_proposed_by ?? live.patch.last_proposed_by ?? ''),
      changedFields: live.coordinationChangedFields,
      latencyMs: Date.now() - input.receivedAt,
      surface: surfaceLabel,
      diagnostics: buildReturnCoordinationLiveDiagnostics({
        rental: nextRental,
        viewerUserId,
        requestSchedulingMeta: prev.requestSchedulingMeta,
        pickupHandoffComplete: prev.pickupHandoffComplete,
        previousReturnStatus,
      }),
    });
    refs = {
      ...refs,
      previousPickupStatus: nextCoord.pickupStatus,
      previousReturnStatus: nextCoord.returnStatus,
    };
  }

  if (live.presenceChanged) {
    const viewerRole = roleForViewerOnRental(nextRental as RentalMeetupRow, viewerUserId);
    const prevPresence = resolvePickupHandoffPresenceState({
      rental: prev.rental,
      renterPickupImHereAt: prev.wizardProgress.renter_pickup_im_here_at,
      renterApprovedPickupPhotosAt: prev.wizardProgress.renter_approved_pickup_photos_at,
      pickupAck: prev.pickupAck,
      ownerPickupPrepComplete: viewerRole === 'owner',
      handoffApprovalStarted: Boolean(
        prev.rental.handoff_approval_started_at?.trim() || prev.rental.handoff_approved_by_owner
      ),
      handoffCompleted: prev.pickupHandoffComplete,
      viewerRole,
    });
    const nextPresence = resolvePickupHandoffPresenceState({
      rental: nextRental,
      renterPickupImHereAt: prev.wizardProgress.renter_pickup_im_here_at,
      renterApprovedPickupPhotosAt: prev.wizardProgress.renter_approved_pickup_photos_at,
      pickupAck: prev.pickupAck,
      ownerPickupPrepComplete: viewerRole === 'owner',
      handoffApprovalStarted: Boolean(
        nextRental.handoff_approval_started_at?.trim() || nextRental.handoff_approved_by_owner
      ),
      handoffCompleted: prev.pickupHandoffComplete,
      viewerRole,
    });
    logPickupHandoffLive({
      rentalId,
      triggerSource: input.triggerSource,
      rerenderedSurface: surfaceLabel,
      ownerArrived: nextPresence.ownerArrived,
      renterArrived: nextPresence.renterArrived,
      bothPresent: nextPresence.bothPresent,
      previousPresenceState: refs.previousLivePhase ?? prevPresence.livePresencePhase,
      nextPresenceState: nextPresence.livePresencePhase,
      latencyMs: Date.now() - input.receivedAt,
    });
    refs = { ...refs, previousLivePhase: nextPresence.livePresencePhase };
  }

  const viewerRole = roleForViewerOnRental(nextRental as RentalMeetupRow, viewerUserId);
  const meetupCoordination = recomputeCanonicalMeetupCoordination({
    rental: nextRental as RentalMeetupRow,
    viewerUserId,
    viewerRole,
    presentationSurface,
    requestSchedulingMeta: prev.requestSchedulingMeta,
    pickupHandoffComplete: prev.pickupHandoffComplete,
    previousRevision: prev.meetupCoordination.revision,
    bumpRevision:
      live.coordinationChanged && (forceBumpRevision || (mergeResult?.shouldBumpRevision ?? true)),
  });

  const next: RentalWizardContext = {
    ...prev,
    rental: nextRental,
    meetupCoordination,
    hasPendingProposal: meetupCoordination.hasPendingProposal,
    pickupCoordinationComplete: meetupCoordination.pickupCoordinationComplete,
    returnCoordinationAgreed: meetupCoordination.returnCoordinationComplete,
    meetupCoordinationComplete: meetupCoordination.meetupCoordinationComplete,
    pickupIso: meetupCoordination.pickupIso,
    returnIso: meetupCoordination.returnIso,
    meetingCompleted: wizardFlags.meetingCompleted,
    meetingAgreementCleared: wizardFlags.meetingAgreementCleared,
  };

  logCoordinationSyncTrace('wizard_layout_ctx', {
    source: 'realtime_live_patch',
    triggerSource: input.triggerSource,
    rentalId,
    forceBumpRevision,
    ...coordinationSyncSnapshotFromRow(nextRental as Record<string, unknown>, meetupCoordination),
  });

  logCoordinationSyncTrace('build_context', {
    source: 'realtime_live_patch',
    rentalId,
    proposal_version: nextRental.proposal_version ?? null,
    meetupCoordinationRevision: meetupCoordination.revision,
  });

  logCoordinationRealtime({
    event: 'context_rebuilt',
    rentalId,
    surface: surfaceLabel,
    proposal_version: nextRental.proposal_version ?? null,
    meetupCoordinationRevision: meetupCoordination.revision,
    pickupPending: meetupCoordination.pickup.isPendingThisPhase,
    returnPending: meetupCoordination.return.isPendingThisPhase,
  });

  return {
    next,
    refs,
    coordinationChanged: live.coordinationChanged,
  };
}
