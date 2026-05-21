import {
  allRequiredPickupItemsDone,
  buildRenterPickupDoneEffective,
  RENTER_PICKUP_ITEMS,
  type RenterPickupViewerFlags,
} from '@/lib/rentalPickupChecklist';

export type InspectionFlowPhase =
  | 'pre_meetup'
  | 'awaiting_arrival'
  | 'both_present_inspection'
  | 'receipt_ready'
  | 'receipt_confirmed'
  | 'complete';

export type PickupInspectionFlowState = {
  inspectionFlowPhase: InspectionFlowPhase;
  evidenceReviewed: boolean;
  bothPresent: boolean;
  checklistCompletionState: Record<string, boolean>;
  allChecklistComplete: boolean;
  receiptButtonEnabled: boolean;
  meetupInspectionCanonical: boolean;
};

export type PickupInspectionFlowInput = {
  bothPresent: boolean;
  handoffApprovalStarted: boolean;
  handoffCompleted: boolean;
  renterArrived: boolean;
  evidenceReviewed: boolean;
  renterConfirmedReceipt: boolean;
  manualChecklist: Record<string, boolean>;
  viewerFlags: RenterPickupViewerFlags;
  pickupRenterConfirmed?: boolean;
};

export function evaluatePickupInspectionFlow(
  input: PickupInspectionFlowInput
): PickupInspectionFlowState {
  const checklistCompletionState = buildRenterPickupDoneEffective(
    input.manualChecklist,
    input.viewerFlags,
    input.pickupRenterConfirmed === true || input.renterConfirmedReceipt
  );
  const allChecklistComplete = allRequiredPickupItemsDone(
    RENTER_PICKUP_ITEMS,
    checklistCompletionState
  );

  const meetupInspectionCanonical =
    input.handoffApprovalStarted &&
    !input.handoffCompleted &&
    (input.bothPresent || input.renterArrived);

  let inspectionFlowPhase: InspectionFlowPhase = 'pre_meetup';
  if (input.handoffCompleted || input.renterConfirmedReceipt) {
    inspectionFlowPhase = input.handoffCompleted ? 'complete' : 'receipt_confirmed';
  } else if (input.bothPresent && allChecklistComplete && input.evidenceReviewed) {
    inspectionFlowPhase = 'receipt_ready';
  } else if (input.bothPresent) {
    inspectionFlowPhase = 'both_present_inspection';
  } else if (input.handoffApprovalStarted && input.renterArrived) {
    inspectionFlowPhase = 'awaiting_arrival';
  }

  const receiptButtonEnabled =
    input.bothPresent &&
    input.evidenceReviewed &&
    allChecklistComplete &&
    !input.renterConfirmedReceipt &&
    input.handoffApprovalStarted &&
    !input.handoffCompleted;

  return {
    inspectionFlowPhase,
    evidenceReviewed: input.evidenceReviewed,
    bothPresent: input.bothPresent,
    checklistCompletionState,
    allChecklistComplete,
    receiptButtonEnabled,
    meetupInspectionCanonical,
  };
}

export function logPickupInspectionFlow(
  rentalId: string,
  input: {
    triggerSource: string;
    state: PickupInspectionFlowState;
    surface: string;
  }
): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  const s = input.state;
  console.log('[pickup-inspection-flow]', {
    rentalId,
    triggerSource: input.triggerSource,
    surface: input.surface,
    inspectionFlowPhase: s.inspectionFlowPhase,
    evidenceReviewed: s.evidenceReviewed,
    bothPresent: s.bothPresent,
    allChecklistComplete: s.allChecklistComplete,
    receiptButtonEnabled: s.receiptButtonEnabled,
    checklistCompletionState: s.checklistCompletionState,
    meetupInspectionCanonical: s.meetupInspectionCanonical,
  });
}
