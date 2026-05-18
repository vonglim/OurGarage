import { DEV_TOOLS_ENABLED } from '@/lib/devTools/gates';
import { getEffectiveNowMs } from '@/lib/rentalSimulation/simulationClock';
import { isRentalCancelled } from '@/lib/rentalCancellation';
import { estimateActivityCtaFromRentalRow } from '@/lib/rentalLifecycle/resolveActivityPresentation';
import { logRentalCancellation } from '@/lib/rentalCancellation/rentalCancellationDebug';
import { logScenario } from '@/lib/rentalLifecycle/scenarioDevLog';
import {
  canShowWizardActiveRental,
  hasReturnSchedule,
  isMeetupCoordinationComplete,
  isPickupCoordinationComplete,
  isWizardReturnPhase,
} from '@/lib/rentalWizard/rentalWizardGates';
import { logPickupCoordinationDiagnostic } from '@/lib/rentalWizard/pickupCoordinationDiagnostics';
import { resolveWizardTransitionBefore } from '@/lib/rentalWizard/rentalWizardTransitionResolver';
import type { RentalWizardContext, RentalWizardDestination, RentalWizardStep } from '@/lib/rentalWizard/types';
import { WIZARD_STEP_META, wizardPathForStep } from '@/lib/rentalWizard/wizardStepMeta';
import { getDevLocalWizardProgress, getDevWizardStepOverride } from '@/store/rentalSimulationStore';
import {
  isPickupHandoffBilaterallyComplete,
  isReturnBilaterallyComplete,
} from '@/lib/rentalOperationalAttention';

/**
 * Core wizard step from workflow gates — never treat booking approval or `rentals.status = active`
 * as equivalent to an in-progress rental after handoff.
 */
const CANCELLED_SUMMARY_STEP: RentalWizardStep = 'cancelled';

export function resolveLogicalWizardStep(ctx: RentalWizardContext): RentalWizardStep {
  if (isRentalCancelled(ctx.rental)) {
    logRentalCancellation('resolver redirected to cancelled_summary', {
      rentalId: ctx.rentalId,
      status: ctx.rental.status,
      cancellation_status: ctx.rental.cancellation_status,
    });
    return CANCELLED_SUMMARY_STEP;
  }

  const st = String(ctx.rental.status ?? 'pending').trim().toLowerCase();

  if (st === 'returned' || st === 'completed') {
    return 'leave_review';
  }

  if (isWizardReturnPhase(ctx)) {
    if (ctx.returnHandoffComplete) return 'leave_review';
    if (ctx.wizardProgress.renter_return_im_here_at) {
      if (ctx.returnAck.owner) return 'return_handoff';
      return 'owner_notified';
    }
    return 'prepare_return';
  }

  if (canShowWizardActiveRental(ctx)) {
    return 'active_rental';
  }

  if (!isPickupCoordinationComplete(ctx)) {
    logPickupCoordinationDiagnostic(ctx, 'resolveLogicalWizardStep', {
      resolvedStep: 'coordinate_pickup',
    });
    return 'coordinate_pickup';
  }

  if (!isMeetupCoordinationComplete(ctx)) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[rental-wizard][resolveLogicalWizardStep] → coordinate_return', {
        rentalId: ctx.rentalId,
        hasReturnSchedule: hasReturnSchedule(ctx),
        pickup_confirmed_seen: ctx.seenTransitions.has('pickup_confirmed_seen'),
        return_ack: Boolean(ctx.wizardProgress.pickup_return_coordination_ack_at),
      });
    }
    return 'coordinate_return';
  }

  if (!ctx.pickupHandoffComplete) {
    const signed = Boolean(ctx.rental.signed_at && String(ctx.rental.signed_at).trim());
    if (signed || ctx.rental.handoff_approved_by_renter) return 'equipment_confirmation';
    if (ctx.rental.handoff_approval_started_at && ctx.wizardProgress.renter_pickup_im_here_at) {
      return 'owner_confirmed_arrival';
    }
    if (
      ctx.wizardProgress.renter_pickup_im_here_at &&
      (ctx.rental.handoff_approval_started_at || ctx.rental.handoff_approved_by_owner)
    ) {
      return 'owner_confirmed_arrival';
    }
    if (ctx.wizardProgress.renter_pickup_im_here_at) return 'owner_confirmed_arrival';
    if (ctx.ownerPickupPhotoCount > 0) {
      if (ctx.pickupAck.renter || ctx.wizardProgress.renter_approved_pickup_photos_at) {
        return 'meetup_day';
      }
      return 'prepare_pickup';
    }
    return 'prepare_pickup';
  }

  return 'prepare_pickup';
}

function mergeDevWizardContext(ctx: RentalWizardContext): RentalWizardContext {
  if (!DEV_TOOLS_ENABLED) return ctx;
  const local = getDevLocalWizardProgress();
  if (Object.keys(local).length === 0) return ctx;
  return { ...ctx, wizardProgress: { ...ctx.wizardProgress, ...local } };
}

export function resolveRentalWizardDestination(
  ctx: RentalWizardContext,
  nowMs = getEffectiveNowMs()
): RentalWizardDestination {
  if (isRentalCancelled(ctx.rental)) {
    logRentalCancellation('resolver redirected to cancelled_summary', {
      rentalId: ctx.rentalId,
      status: ctx.rental.status,
      cancellation_status: ctx.rental.cancellation_status,
      overridesSkipped: true,
    });
    const meta = WIZARD_STEP_META[CANCELLED_SUMMARY_STEP];
    return {
      step: CANCELLED_SUMMARY_STEP,
      ctaLabel: meta.ctaLabel,
      path: wizardPathForStep(ctx.rentalId, CANCELLED_SUMMARY_STEP),
    };
  }

  const merged = mergeDevWizardContext(ctx);
  const stepOverride = DEV_TOOLS_ENABLED ? getDevWizardStepOverride() : null;
  if (stepOverride) {
    const meta = WIZARD_STEP_META[stepOverride];
    return {
      step: stepOverride,
      ctaLabel: meta.ctaLabel,
      path: wizardPathForStep(ctx.rentalId, stepOverride),
    };
  }
  const logical = resolveLogicalWizardStep(merged);
  const transition = resolveWizardTransitionBefore(logical, merged, nowMs);
  const step = transition ?? logical;
  logScenario('routing', {
    event: 'wizard_destination_resolved',
    rentalId: merged.rentalId,
    source: 'resolveRentalWizardDestination',
    logicalStep: logical,
    transitionStep: transition,
    step,
    path: wizardPathForStep(ctx.rentalId, step),
  });
  const meta = WIZARD_STEP_META[step];
  return {
    step,
    ctaLabel: meta.ctaLabel,
    path: wizardPathForStep(ctx.rentalId, step),
  };
}

/** Lightweight label for activity list cards — delegates to canonical lifecycle estimate. */
export function estimateWizardCtaLabelFromRentalRow(input: {
  status?: string | null;
  cancellation_status?: string | null;
  agreement_status?: string | null;
  last_proposed_by?: string | null;
  agreed_pickup_datetime?: string | null;
  agreed_return_datetime?: string | null;
  signed_at?: string | null;
  meetup_location?: string | null;
  owner_confirmed?: boolean | null;
  renter_confirmed?: boolean | null;
}): string | null {
  return estimateActivityCtaFromRentalRow(input);
}

export { buildRentalWizardContextFlags } from '@/lib/rentalWizard/rentalWizardContextFlags';
export { isPickupHandoffBilaterallyComplete, isReturnBilaterallyComplete };
