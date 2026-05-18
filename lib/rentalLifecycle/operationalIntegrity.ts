import {
  isRentalActiveForQueues,
  isRentalCancelled,
  isRentalCancelledHistory,
  isRentalCompletedHistory,
} from '@/lib/rentalCancellation/rentalCancellationGates';
import { estimateCanonicalPhaseFromRentalRow } from '@/lib/rentalLifecycle/estimatePhaseFromRentalRow';
import type { CanonicalRentalPhase } from '@/lib/rentalLifecycle/canonicalPhases';
import { logScenario } from '@/lib/rentalLifecycle/scenarioDevLog';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';

const TERMINAL_PHASES: CanonicalRentalPhase[] = ['cancelled', 'completed'];
const ACTIVE_OPERATIONAL_PHASES: CanonicalRentalPhase[] = [
  'active_rental',
  'return_pending',
  'prepare_pickup',
  'meetup_day',
  'pickup_confirmed',
];

/** Phases that must not appear for cancelled rentals. */
export function isOperationalQueueEligible(row: {
  status?: string | null;
  cancellation_status?: string | null;
}): boolean {
  return isRentalActiveForQueues(row);
}

export function assertOperationalQueues(row: {
  id?: string;
  status?: string | null;
  cancellation_status?: string | null;
}): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  if (isRentalCancelled(row) && isOperationalQueueEligible(row)) {
    logScenario('lifecycle', {
      event: 'operational_queue_violation',
      rentalId: row.id,
      message: 'Cancelled rental still eligible for active queue',
    });
  }
  if (isRentalCompletedHistory(row) && isOperationalQueueEligible(row)) {
    logScenario('lifecycle', {
      event: 'operational_queue_violation',
      rentalId: row.id,
      message: 'Completed rental still eligible for active queue',
    });
  }
}

/**
 * DEV: detect impossible backward phase regression from stored row vs wizard context.
 */
export function detectPhaseRegression(
  ctx: RentalWizardContext
): { regressed: boolean; message: string | null } {
  const rowPhase = estimateCanonicalPhaseFromRentalRow(ctx.rental);
  if (isRentalCancelled(ctx.rental) || isRentalCompletedHistory(ctx.rental)) {
    if (ACTIVE_OPERATIONAL_PHASES.includes(rowPhase)) {
      return { regressed: true, message: `Terminal rental estimated as ${rowPhase}` };
    }
  }
  if (ctx.pickupHandoffComplete && rowPhase === 'coordinate_pickup') {
    return { regressed: true, message: 'Handoff complete but phase regressed to coordinate_pickup' };
  }
  if (ctx.returnHandoffComplete && !TERMINAL_PHASES.includes(rowPhase) && rowPhase !== 'review_pending') {
    return {
      regressed: true,
      message: `Return handoff complete but phase is ${rowPhase}`,
    };
  }
  return { regressed: false, message: null };
}

export function assertNoPhaseRegression(ctx: RentalWizardContext, source: string): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  const { regressed, message } = detectPhaseRegression(ctx);
  if (regressed) {
    logScenario('lifecycle', {
      event: 'phase_regression',
      rentalId: ctx.rentalId,
      source,
      message,
    });
  }
}

export { isRentalCancelledHistory, isRentalCompletedHistory };
