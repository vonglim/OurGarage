import {
  evaluatePickupInspectionFlow,
  type PickupInspectionFlowInput,
  type PickupInspectionFlowState,
} from '@/lib/pickupInspectionFlow';
import {
  deriveWizardRenterViewerFlags,
  renterPickupManualFromVerificationRows,
  type RenterPickupViewerFlags,
} from '@/lib/rentalPickupChecklist';
import {
  resolveRentalActivationState,
  type RentalActivationWizardSlice,
} from '@/lib/rentalActivation';
import { isPickupHandoffBilaterallyComplete } from '@/lib/rentalOperationalAttention';
import type { RentalWizardContext, RentalWizardRentalRow, RentalWizardStep } from '@/lib/rentalWizard/types';
import type { RentalVerificationRow } from '@/lib/rentalVerification';
import { resolveAuthorizationStepForPickupHandoff } from '@/lib/rentalAuthorization/resolveAuthorizationWizardStep';
import { canShowWizardActiveRental } from '@/lib/rentalWizard/rentalWizardGates';

export type PickupHandoffNextOperationalStep =
  | 'active_rental'
  | 'transition_enjoy_rental'
  | 'equipment_confirmation'
  | 'owner_confirmed_arrival'
  | 'meetup_day'
  | 'prepare_pickup';

export type PickupHandoffCompletionState = {
  ownerArrived: boolean;
  renterArrived: boolean;
  bothPresent: boolean;
  renterConfirmedReceipt: boolean;
  ownerConfirmedHandoff: boolean;
  possessionTransferred: boolean;
  signaturesRequired: boolean;
  signaturesComplete: boolean;
  evidenceReviewed: boolean;
  allChecklistComplete: boolean;
  pickupInspectionComplete: boolean;
  physicalPossessionConfirmed: boolean;
  /** @deprecated Use {@link resolveRentalActivationState}.rentalActivated */
  handoffComplete: boolean;
  nextOperationalStep: PickupHandoffNextOperationalStep;
  inspection: PickupInspectionFlowState;
};

export type PickupHandoffCompletionRentalSlice = {
  status?: string | null;
  owner_arrived_at?: string | null;
  renter_arrived_at?: string | null;
  handoff_approval_started_at?: string | null;
  handoff_approved_by_owner?: boolean | null;
  handoff_approved_by_renter?: boolean | null;
  signed_at?: string | null;
  renter_confirmed_receipt_at?: string | null;
  owner_confirmed_handoff_at?: string | null;
  possession_transferred_at?: string | null;
  pickup_handoff_completed_at?: string | null;
  physical_possession_confirmed_at?: string | null;
  rental_activated_at?: string | null;
  agreement_acknowledged_at?: string | null;
  preauth_status?: string | null;
  preauth_authorized_at?: string | null;
};

export type PickupHandoffCompletionInput = {
  rental: PickupHandoffCompletionRentalSlice;
  pickupAck: { owner: boolean; renter: boolean };
  renterConfirmedReceiptAt?: string | null;
  renterPickupImHereAt?: string | null;
  renterApprovedPickupPhotosAt?: string | null;
  renterPickupEvidenceReviewOpenedAt?: string | null;
  manualChecklist?: Record<string, boolean>;
  viewerFlags?: RenterPickupViewerFlags;
  wizard?: RentalActivationWizardSlice | null;
};

function parseTs(v: string | null | undefined): boolean {
  return Boolean(v?.trim() && Number.isFinite(Date.parse(v.trim())));
}

function buildInspectionFlowInput(
  input: PickupHandoffCompletionInput
): PickupInspectionFlowInput {
  const handoffApprovalStarted = Boolean(
    input.rental.handoff_approval_started_at?.trim() || input.rental.handoff_approved_by_owner === true
  );
  const renterArrived = Boolean(
    input.renterPickupImHereAt?.trim() || input.rental.renter_arrived_at?.trim()
  );
  const bothPresent = Boolean(input.rental.owner_arrived_at?.trim() && renterArrived);
  const evidenceReviewed = Boolean(
    input.renterApprovedPickupPhotosAt?.trim() ||
      input.renterPickupEvidenceReviewOpenedAt?.trim() ||
      input.viewerFlags?.reviewedOwnerPhotos
  );
  const renterReceiptMilestone =
    parseTs(input.rental.renter_confirmed_receipt_at) || parseTs(input.renterConfirmedReceiptAt);

  return {
    bothPresent,
    handoffApprovalStarted,
    handoffCompleted: false,
    renterArrived,
    evidenceReviewed,
    renterConfirmedReceipt: renterReceiptMilestone || input.pickupAck.renter,
    manualChecklist: input.manualChecklist ?? {},
    viewerFlags: input.viewerFlags ?? {
      reviewedOwnerPhotos: false,
      viewedTimestampProof: false,
    },
    pickupRenterConfirmed: input.pickupAck.renter,
  };
}

/**
 * Canonical pickup handoff completion — single authority for wizard routing, workspace
 * lifecycle, sticky footer, and active-rental transition. No `rentals.status` shortcuts.
 */
export function resolvePickupHandoffCompletionState(
  input: PickupHandoffCompletionInput
): PickupHandoffCompletionState {
  const { rental, pickupAck } = input;
  const ownerArrived = parseTs(rental.owner_arrived_at);
  const renterArrived = parseTs(rental.renter_arrived_at) || Boolean(input.renterPickupImHereAt?.trim());
  const bothPresent = ownerArrived && renterArrived;

  const inspection = evaluatePickupInspectionFlow(buildInspectionFlowInput(input));

  const renterConfirmedReceipt =
    (parseTs(rental.renter_confirmed_receipt_at) || parseTs(input.renterConfirmedReceiptAt)) &&
    inspection.evidenceReviewed &&
    inspection.allChecklistComplete;

  const ownerConfirmedHandoff =
    parseTs(rental.owner_confirmed_handoff_at) || pickupAck.owner;

  const signaturesRequired = Boolean(
    rental.handoff_approval_started_at?.trim() || rental.handoff_approved_by_owner === true
  );
  const signaturesComplete =
    parseTs(rental.signed_at) || rental.handoff_approved_by_renter === true;

  const handoffApprovalStarted = Boolean(
    rental.handoff_approval_started_at?.trim() || rental.handoff_approved_by_owner === true
  );

  const ownerHandoffGate =
    !handoffApprovalStarted && !signaturesRequired
      ? true
      : ownerConfirmedHandoff && (!signaturesRequired || signaturesComplete);

  const pickupInspectionComplete =
    inspection.inspectionFlowPhase === 'complete' ||
    (bothPresent &&
      inspection.evidenceReviewed &&
      inspection.allChecklistComplete &&
      renterConfirmedReceipt);

  const bilateralAck = isPickupHandoffBilaterallyComplete({
    pickupAck,
    signedAt: rental.signed_at,
  });

  const physicalPossessionConfirmed =
    bothPresent &&
    inspection.evidenceReviewed &&
    inspection.allChecklistComplete &&
    pickupInspectionComplete &&
    renterConfirmedReceipt &&
    ownerHandoffGate &&
    bilateralAck &&
    parseTs(rental.physical_possession_confirmed_at) &&
    parseTs(rental.possession_transferred_at);

  /** Physical possession only — legal activation is {@link resolveRentalActivationState}. */
  const handoffComplete = false;
  const possessionTransferred = physicalPossessionConfirmed;

  let nextOperationalStep: PickupHandoffNextOperationalStep = 'prepare_pickup';
  if (physicalPossessionConfirmed) {
    nextOperationalStep = 'equipment_confirmation';
  } else if (signaturesRequired && !signaturesComplete) {
    nextOperationalStep = 'equipment_confirmation';
  } else if (renterConfirmedReceipt || ownerConfirmedHandoff) {
    nextOperationalStep = 'equipment_confirmation';
  } else if (bothPresent) {
    nextOperationalStep = 'owner_confirmed_arrival';
  } else if (renterArrived) {
    nextOperationalStep = 'meetup_day';
  }

  return {
    ownerArrived,
    renterArrived,
    bothPresent,
    renterConfirmedReceipt,
    ownerConfirmedHandoff,
    possessionTransferred,
    signaturesRequired,
    signaturesComplete,
    evidenceReviewed: inspection.evidenceReviewed,
    allChecklistComplete: inspection.allChecklistComplete,
    pickupInspectionComplete,
    physicalPossessionConfirmed,
    handoffComplete,
    nextOperationalStep,
    inspection,
  };
}

export function buildPickupHandoffCompletionInputFromWizard(
  ctx: RentalWizardContext
): PickupHandoffCompletionInput {
  return buildPickupHandoffCompletionInputFromParts({
    rental: ctx.rental,
    pickupAck: ctx.pickupAck,
    wizardProgress: ctx.wizardProgress,
    verificationRows: ctx.verificationRows,
    viewerUserId: ctx.viewerUserId,
  });
}

export function buildPickupHandoffCompletionInputFromParts(input: {
  rental: PickupHandoffCompletionRentalSlice;
  pickupAck: { owner: boolean; renter: boolean };
  wizardProgress: {
    renter_confirmed_pickup_receipt_at?: string | null;
    renter_pickup_im_here_at?: string | null;
    renter_approved_pickup_photos_at?: string | null;
    renter_pickup_evidence_review_opened_at?: string | null;
    renter_viewed_timestamp_proof_at?: string | null;
    rental_agreement_acknowledged_at?: string | null;
  };
  verificationRows: RentalVerificationRow[];
  viewerUserId: string;
}): PickupHandoffCompletionInput {
  return {
    rental: input.rental,
    pickupAck: input.pickupAck,
    renterConfirmedReceiptAt: input.wizardProgress.renter_confirmed_pickup_receipt_at,
    renterPickupImHereAt: input.wizardProgress.renter_pickup_im_here_at,
    renterApprovedPickupPhotosAt: input.wizardProgress.renter_approved_pickup_photos_at,
    renterPickupEvidenceReviewOpenedAt: input.wizardProgress.renter_pickup_evidence_review_opened_at,
    wizard: {
      rental_agreement_acknowledged_at: input.wizardProgress.rental_agreement_acknowledged_at,
    },
    manualChecklist: renterPickupManualFromVerificationRows(
      input.verificationRows,
      input.viewerUserId
    ),
    viewerFlags: deriveWizardRenterViewerFlags({
      renterApprovedPickupPhotosAt: input.wizardProgress.renter_approved_pickup_photos_at,
      renterPickupEvidenceReviewOpenedAt:
        input.wizardProgress.renter_pickup_evidence_review_opened_at,
      renterViewedTimestampProofAt: input.wizardProgress.renter_viewed_timestamp_proof_at,
    }),
  };
}

export function buildPickupHandoffCompletionInputFromWorkspace(input: {
  rental: PickupHandoffCompletionRentalSlice & {
    owner_user_id: string;
    renter_user_id: string;
  };
  pickupAck: { owner: boolean; renter: boolean };
  verificationRows: RentalVerificationRow[];
  renterPickupImHereAt?: string | null;
  renterApprovedPickupPhotosAt?: string | null;
  renterPickupEvidenceReviewOpenedAt?: string | null;
  renterViewedTimestampProofAt?: string | null;
  renterPickupViewFlags?: RenterPickupViewerFlags;
}): PickupHandoffCompletionInput {
  return {
    rental: input.rental,
    pickupAck: input.pickupAck,
    renterConfirmedReceiptAt: null,
    renterPickupImHereAt: input.renterPickupImHereAt,
    renterApprovedPickupPhotosAt: input.renterApprovedPickupPhotosAt,
    renterPickupEvidenceReviewOpenedAt: input.renterPickupEvidenceReviewOpenedAt,
    manualChecklist: renterPickupManualFromVerificationRows(
      input.verificationRows,
      input.rental.renter_user_id
    ),
    viewerFlags:
      input.renterPickupViewFlags ??
      deriveWizardRenterViewerFlags({
        renterApprovedPickupPhotosAt: input.renterApprovedPickupPhotosAt,
        renterPickupEvidenceReviewOpenedAt: input.renterPickupEvidenceReviewOpenedAt,
        renterViewedTimestampProofAt: input.renterViewedTimestampProofAt,
      }),
  };
}

/** Meetup presence routing applies only before physical possession is confirmed. */
export function isMeetupPresenceRoutingActive(completion: PickupHandoffCompletionState): boolean {
  return !completion.physicalPossessionConfirmed;
}

export function logPickupHandoffRouting(input: {
  rentalId: string;
  logicalStep: RentalWizardStep;
  completion: PickupHandoffCompletionState;
  resolverReason: string;
}): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  const c = input.completion;
  console.log('[pickup-handoff-routing]', {
    rentalId: input.rentalId,
    logicalStep: input.logicalStep,
    bothPresent: c.bothPresent,
    renterConfirmedReceipt: c.renterConfirmedReceipt,
    possessionTransferred: c.possessionTransferred,
    handoffComplete: c.handoffComplete,
    evidenceReviewed: c.evidenceReviewed,
    allChecklistComplete: c.allChecklistComplete,
    pickupInspectionComplete: c.pickupInspectionComplete,
    signaturesRequired: c.signaturesRequired,
    signaturesComplete: c.signaturesComplete,
    resolverReason: input.resolverReason,
    nextOperationalStep: c.nextOperationalStep,
  });
}

export function logPickupLifecycleDesync(input: {
  rentalId: string;
  surface: string;
  wizardLogicalStep?: string | null;
  workspaceStage?: string | null;
  lifecyclePhase?: string | null;
  completion: PickupHandoffCompletionState;
  rentalActivated?: boolean;
  transitionReason?: string;
}): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  const c = input.completion;
  const activated = input.rentalActivated === true;
  const wizardPastPickup =
    input.wizardLogicalStep === 'active_rental' ||
    input.wizardLogicalStep === 'transition_enjoy_rental' ||
    input.wizardLogicalStep === 'transition_return_reminder';
  const workspacePastPickup =
    input.workspaceStage === 'active' ||
    input.lifecyclePhase === 'active';
  const desync =
    (wizardPastPickup && !activated) || (workspacePastPickup && !activated);

  console.log('[pickup-lifecycle-desync]', {
    rentalId: input.rentalId,
    surface: input.surface,
    desync,
    wizardLogicalStep: input.wizardLogicalStep ?? null,
    workspaceStage: input.workspaceStage ?? null,
    lifecyclePhase: input.lifecyclePhase ?? null,
    pickupInspectionComplete: c.pickupInspectionComplete,
    rentalActivated: activated,
    physicalPossessionConfirmed: c.physicalPossessionConfirmed,
    evidenceReviewed: c.evidenceReviewed,
    allChecklistComplete: c.allChecklistComplete,
    renterConfirmedReceipt: c.renterConfirmedReceipt,
    possessionTransferred: c.possessionTransferred,
    bothPresent: c.bothPresent,
    ownerConfirmedHandoff: c.ownerConfirmedHandoff,
    signaturesComplete: c.signaturesComplete,
    transitionReason: input.transitionReason ?? null,
    inspectionFlowPhase: c.inspection.inspectionFlowPhase,
  });
}

/**
 * Pickup handoff wizard step — never advance to active rental without canonical handoffComplete.
 */
export function resolveWizardPickupHandoffStep(ctx: RentalWizardContext): {
  step: RentalWizardStep;
  reason: string;
  completion: PickupHandoffCompletionState;
  activation: ReturnType<typeof resolveRentalActivationState>;
} {
  const handoffInput = buildPickupHandoffCompletionInputFromWizard(ctx);
  const activation = resolveRentalActivationState(handoffInput);
  const completion = activation.physical;

  if (activation.rentalActivated && canShowWizardActiveRental(ctx)) {
    return {
      step: 'active_rental',
      reason: 'rental_activated_active',
      completion,
      activation,
    };
  }

  if (activation.rentalActivated) {
    return {
      step: 'transition_enjoy_rental',
      reason: 'rental_activated_transition',
      completion,
      activation,
    };
  }

  if (completion.physicalPossessionConfirmed && !activation.rentalActivated) {
    const authStep = resolveAuthorizationStepForPickupHandoff(ctx);
    if (authStep) {
      return {
        step: authStep,
        reason: `authorization_${authStep}`,
        completion,
        activation,
      };
    }
  }

  if (completion.signaturesRequired && !completion.signaturesComplete) {
    const authStep = resolveAuthorizationStepForPickupHandoff(ctx);
    if (authStep) {
      return {
        step: authStep,
        reason: 'signatures_required',
        completion,
        activation,
      };
    }
  }

  if (completion.renterConfirmedReceipt || completion.ownerConfirmedHandoff) {
    const authStep = resolveAuthorizationStepForPickupHandoff(ctx);
    if (authStep) {
      return {
        step: authStep,
        reason: completion.renterConfirmedReceipt
          ? 'renter_confirmed_receipt'
          : 'owner_confirmed_handoff',
        completion,
        activation,
      };
    }
  }

  if (!isMeetupPresenceRoutingActive(completion)) {
    const authStep = resolveAuthorizationStepForPickupHandoff(ctx);
    if (authStep) {
      return {
        step: authStep,
        reason: 'presence_deactivated',
        completion,
        activation,
      };
    }
  }

  const renterAtMeetup = Boolean(
    ctx.wizardProgress.renter_pickup_im_here_at?.trim() || ctx.rental.renter_arrived_at?.trim()
  );
  const ownerAtMeetup = Boolean(ctx.rental.owner_arrived_at?.trim());

  if (renterAtMeetup && ownerAtMeetup) {
    if (!completion.renterConfirmedReceipt) {
      return {
        step: 'owner_confirmed_arrival',
        reason: 'both_present_inspection',
        completion,
        activation,
      };
    }
    if (!activation.rentalActivated) {
      const authStep = resolveAuthorizationStepForPickupHandoff(ctx);
      if (authStep) {
        return {
          step: authStep,
          reason: 'both_present_authorization',
          completion,
          activation,
        };
      }
    }
    const authStep = resolveAuthorizationStepForPickupHandoff(ctx);
    if (authStep) {
      return {
        step: authStep,
        reason: 'both_present_authorization',
        completion,
        activation,
      };
    }
    return {
      step: 'equipment_confirmation',
      reason: 'both_present_receipt_confirmed',
      completion,
      activation,
    };
  }
  if (renterAtMeetup && !ownerAtMeetup) {
    return { step: 'meetup_day', reason: 'renter_arrived_waiting_owner', completion, activation };
  }
  if (ctx.pickupEvidenceReadiness.renterEvidenceReady || ctx.ownerPickupPhotoCount > 0) {
    if (ctx.pickupAck.renter || ctx.wizardProgress.renter_approved_pickup_photos_at) {
      return { step: 'meetup_day', reason: 'evidence_approved', completion, activation };
    }
    return { step: 'prepare_pickup', reason: 'evidence_pending_review', completion, activation };
  }

  return { step: 'prepare_pickup', reason: 'default_prepare_pickup', completion, activation };
}
