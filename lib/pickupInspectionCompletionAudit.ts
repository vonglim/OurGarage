import {
  buildPickupHandoffCompletionInputFromWizard,
  resolvePickupHandoffCompletionState,
  resolveWizardPickupHandoffStep,
} from '@/lib/pickupHandoffCompletion';
import { evaluatePickupInspectionFlow } from '@/lib/pickupInspectionFlow';
import {
  deriveWizardRenterViewerFlags,
  renterPickupManualFromVerificationRows,
} from '@/lib/rentalPickupChecklist';
import { resolveRentalWizardDestination } from '@/lib/rentalWizard/rentalWizardStepResolver';
import type { RentalWizardContext, RentalWizardStep } from '@/lib/rentalWizard/types';

export type PickupInspectionCompletionAudit = {
  surface: string;
  currentWizardStep: RentalWizardStep | null;
  checklistCompletionState: Record<string, boolean>;
  uiReceiptButtonEnabled: boolean;
  providerReceiptButtonEnabled: boolean;
  evidenceReviewed: boolean;
  bothPresent: boolean;
  handoffApprovalStarted: boolean;
  pickupAckRenter: boolean;
  completionRenterConfirmedReceipt: boolean;
  pickupInspectionComplete: boolean;
  resolveWizardPickupHandoffStep: { step: string; reason: string };
  resolveRentalWizardDestination: { step: string; path: string };
  manualChecklistKeys: string[];
  lifecyclePromptBlocking?: boolean;
};

function inspectionInputFromCtx(ctx: RentalWizardContext, renterConfirmedReceipt: boolean) {
  const evidenceReviewed = Boolean(
    ctx.wizardProgress.renter_approved_pickup_photos_at?.trim() ||
      ctx.wizardProgress.renter_pickup_evidence_review_opened_at?.trim()
  );
  const bothPresent = Boolean(
    ctx.rental.owner_arrived_at?.trim() &&
      (ctx.wizardProgress.renter_pickup_im_here_at?.trim() || ctx.rental.renter_arrived_at?.trim())
  );
  return evaluatePickupInspectionFlow({
    bothPresent,
    handoffApprovalStarted: Boolean(
      ctx.rental.handoff_approval_started_at?.trim() || ctx.rental.handoff_approved_by_owner
    ),
    handoffCompleted: ctx.pickupHandoffComplete,
    renterArrived: Boolean(
      ctx.wizardProgress.renter_pickup_im_here_at?.trim() || ctx.rental.renter_arrived_at?.trim()
    ),
    evidenceReviewed,
    renterConfirmedReceipt,
    manualChecklist: renterPickupManualFromVerificationRows(ctx.verificationRows, ctx.viewerUserId),
    viewerFlags: deriveWizardRenterViewerFlags({
      renterApprovedPickupPhotosAt: ctx.wizardProgress.renter_approved_pickup_photos_at,
      renterPickupEvidenceReviewOpenedAt: ctx.wizardProgress.renter_pickup_evidence_review_opened_at,
      renterViewedTimestampProofAt: ctx.wizardProgress.renter_viewed_timestamp_proof_at,
    }),
    pickupRenterConfirmed: ctx.pickupAck.renter,
  });
}

export function buildPickupInspectionCompletionAudit(input: {
  ctx: RentalWizardContext;
  surface: string;
  currentWizardStep?: RentalWizardStep | null;
  lifecyclePromptBlocking?: boolean;
}): PickupInspectionCompletionAudit {
  const { ctx } = input;
  const completion = resolvePickupHandoffCompletionState(
    buildPickupHandoffCompletionInputFromWizard(ctx)
  );
  const uiInspection = inspectionInputFromCtx(ctx, completion.renterConfirmedReceipt);
  const providerInspection = inspectionInputFromCtx(ctx, ctx.pickupAck.renter);
  const handoff = resolveWizardPickupHandoffStep(ctx);
  const dest = resolveRentalWizardDestination(ctx);
  const manualChecklist = renterPickupManualFromVerificationRows(
    ctx.verificationRows,
    ctx.viewerUserId
  );

  return {
    surface: input.surface,
    currentWizardStep: input.currentWizardStep ?? null,
    checklistCompletionState: uiInspection.checklistCompletionState,
    uiReceiptButtonEnabled: uiInspection.receiptButtonEnabled,
    providerReceiptButtonEnabled: providerInspection.receiptButtonEnabled,
    evidenceReviewed: uiInspection.evidenceReviewed,
    bothPresent: uiInspection.bothPresent,
    handoffApprovalStarted: Boolean(
      ctx.rental.handoff_approval_started_at?.trim() || ctx.rental.handoff_approved_by_owner
    ),
    pickupAckRenter: ctx.pickupAck.renter,
    completionRenterConfirmedReceipt: completion.renterConfirmedReceipt,
    pickupInspectionComplete: completion.pickupInspectionComplete,
    resolveWizardPickupHandoffStep: { step: handoff.step, reason: handoff.reason },
    resolveRentalWizardDestination: { step: dest.step, path: dest.path },
    manualChecklistKeys: Object.entries(manualChecklist)
      .filter(([, v]) => v)
      .map(([k]) => k),
    lifecyclePromptBlocking: input.lifecyclePromptBlocking,
  };
}

export function logPickupInspectionCompletionAudit(
  audit: PickupInspectionCompletionAudit,
  extra?: Record<string, unknown>
): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  console.log('[pickup-inspection-completion-audit]', { ...audit, ...extra });
}
