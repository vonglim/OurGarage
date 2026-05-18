import { isRentalCancelled, isCancellationRequested } from '@/lib/rentalCancellation';
import { estimateCanonicalPhaseFromRentalRow } from '@/lib/rentalLifecycle/estimatePhaseFromRentalRow';
import { logScenario } from '@/lib/rentalLifecycle/scenarioDevLog';
import { buildLifecycleInspectorSnapshot } from '@/lib/rentalLifecycle/resolveLifecycleReasoning';
import {
  canShowWizardActiveRental,
  isPickupCoordinationComplete,
} from '@/lib/rentalWizard/rentalWizardGates';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';
import type { RentalWizardRentalRow } from '@/lib/rentalWizard/types';

export type LifecycleValidationSeverity = 'error' | 'warn';

export type LifecycleValidationIssue = {
  code: string;
  severity: LifecycleValidationSeverity;
  message: string;
};

declare const __DEV__: boolean;

export function validateRentalLifecycle(ctx: RentalWizardContext): LifecycleValidationIssue[] {
  const issues: LifecycleValidationIssue[] = [];
  const r = ctx.rental;
  const st = String(r.status ?? '').trim().toLowerCase();
  const snapshot = buildLifecycleInspectorSnapshot(ctx);

  if (isRentalCancelled(r)) {
    if (st !== 'cancelled' && st !== 'canceled') {
      issues.push({
        code: 'cancelled_status_mismatch',
        severity: 'error',
        message: 'cancellation terminal but rentals.status is not cancelled.',
      });
    }
    if (snapshot.effective_wizard_step !== 'cancelled') {
      issues.push({
        code: 'cancelled_wizard_step',
        severity: 'error',
        message: `Cancelled rental resolved to wizard step ${snapshot.effective_wizard_step} (expected cancelled).`,
      });
    }
  }

  if (isRentalCancelled(r) && (st === 'active' || st === 'handed_off')) {
    issues.push({
      code: 'cancelled_plus_active',
      severity: 'error',
      message: 'Invalid: cancelled + active_rental status simultaneously.',
    });
  }

  if (ctx.pickupHandoffComplete && !r.agreed_pickup_datetime?.trim()) {
    issues.push({
      code: 'handoff_without_pickup_datetime',
      severity: 'warn',
      message: 'pickup_handoff_complete but agreed_pickup_datetime missing.',
    });
  }

  if (ctx.pickupHandoffComplete && !r.meetup_location?.trim()) {
    issues.push({
      code: 'handoff_without_location',
      severity: 'warn',
      message: 'pickup_handoff_complete but meetup_location missing.',
    });
  }

  if ((st === 'returned' || st === 'completed') && !ctx.returnHandoffComplete) {
    issues.push({
      code: 'completed_without_return_handoff',
      severity: 'warn',
      message: 'status completed/returned but returnHandoffComplete is false.',
    });
  }

  if (
    snapshot.effective_wizard_step === 'coordinate_return' &&
    !isPickupCoordinationComplete(ctx)
  ) {
    issues.push({
      code: 'return_before_pickup',
      severity: 'error',
      message: 'coordinate_return while pickup coordination incomplete.',
    });
  }

  if (snapshot.effective_wizard_step === 'active_rental' && !ctx.pickupHandoffComplete) {
    issues.push({
      code: 'active_without_handoff',
      severity: 'error',
      message: 'active_rental step but pickupHandoffComplete=false.',
    });
  }
  if (canShowWizardActiveRental(ctx) && !ctx.pickupHandoffComplete) {
    issues.push({
      code: 'active_gate_inconsistent',
      severity: 'error',
      message: 'canShowWizardActiveRental true but pickupHandoffComplete false.',
    });
  }

  if (snapshot.card_wizard_phase_mismatch) {
    issues.push({
      code: 'card_wizard_phase_mismatch',
      severity: 'warn',
      message: `Activity card estimates ${snapshot.estimated_card_phase} but wizard is ${snapshot.canonical_phase} (missing wizard_state on card is expected for transitions).`,
    });
  }

  if (isCancellationRequested(r) && isRentalCancelled(r)) {
    issues.push({
      code: 'requested_and_cancelled',
      severity: 'error',
      message: 'cancellation_status requested while also terminal cancelled.',
    });
  }

  return issues;
}

export function validateRentalRowLight(row: RentalWizardRentalRow): LifecycleValidationIssue[] {
  const issues: LifecycleValidationIssue[] = [];
  const st = String(row.status ?? '').trim().toLowerCase();

  if (isRentalCancelled(row) && (st === 'active' || st === 'handed_off')) {
    issues.push({
      code: 'cancelled_plus_active_row',
      severity: 'error',
      message: 'Row: cancelled lifecycle but status is active/handed_off.',
    });
  }

  const hasPickup = Boolean(row.agreed_pickup_datetime?.trim());
  const hasLoc = Boolean(row.meetup_location?.trim());
  if ((st === 'handed_off' || st === 'active') && (!hasPickup || !hasLoc)) {
    issues.push({
      code: 'active_missing_schedule',
      severity: 'warn',
      message: 'Row: active/handed_off without canonical pickup schedule.',
    });
  }

  return issues;
}

/** Logs issues in DEV; call after wizard context build or toolkit open. */
export function assertRentalLifecycleIntegrity(
  ctx: RentalWizardContext,
  source: string
): LifecycleValidationIssue[] {
  const issues = [...validateRentalLifecycle(ctx), ...validateRentalRowLight(ctx.rental)];
  if (typeof __DEV__ === 'undefined' || !__DEV__) return issues;
  for (const issue of issues) {
    logScenario('lifecycle', {
      event: 'integrity_issue',
      source,
      severity: issue.severity,
      code: issue.code,
      message: issue.message,
      rentalId: ctx.rentalId,
    });
  }
  return issues;
}
