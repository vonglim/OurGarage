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
import { recordMeetupCoordinationSurfaceSnapshot } from '@/lib/rentalMeetupCoordinationState';
import { logRentalStageTransitionAudit } from '@/lib/rentalStageTransitionAudit';
import { resolveWizardTransitionBefore } from '@/lib/rentalWizard/rentalWizardTransitionResolver';
import type { RentalWizardContext, RentalWizardDestination, RentalWizardStep } from '@/lib/rentalWizard/types';
import { WIZARD_STEP_META, wizardPathForStep } from '@/lib/rentalWizard/wizardStepMeta';
import { getDevLocalWizardProgress, getDevWizardStepOverride } from '@/store/rentalSimulationStore';
import {
  logPickupHandoffRouting,
  resolveWizardPickupHandoffStep,
} from '@/lib/pickupHandoffCompletion';
import { normalizeMeetupWizardStep } from '@/lib/rentalLifecycle/normalizeMeetupWizardStep';
import {
  logRentalActivationSchema,
  resolveFallbackLogicalWizardStep,
} from '@/lib/rentalActivationSchema';
import { isReturnBilaterallyComplete } from '@/lib/rentalOperationalAttention';

/**
 * Core wizard step from workflow gates — never treat booking approval or `rentals.status = active`
 * as equivalent to an in-progress rental after handoff.
 */
const CANCELLED_SUMMARY_STEP: RentalWizardStep = 'cancelled';

function resolveLogicalWizardStepInner(ctx: RentalWizardContext): RentalWizardStep {
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

  if (!isPickupCoordinationComplete(ctx)) {
    logPickupCoordinationDiagnostic(ctx, 'resolveLogicalWizardStep', {
      resolvedStep: 'coordinate_pickup',
    });
    return 'coordinate_pickup';
  }

  if (!isMeetupCoordinationComplete(ctx)) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      logRentalStageTransitionAudit({
        rentalId: ctx.rentalId,
        triggeredBy: 'resolveLogicalWizardStep',
        transitionReason: 'pickup_complete_return_incomplete→coordinate_return',
        resolvedRenterPhase: 'coordinate_return',
        rental: ctx.rental,
        pickupComplete: true,
        returnComplete: false,
        meetupComplete: false,
      });
      recordMeetupCoordinationSurfaceSnapshot({
        rentalId: ctx.rentalId,
        surface: 'transition_resolver',
        resolver: 'resolveLogicalWizardStep→coordinate_return',
        rental: ctx.rental,
        requestSchedulingMeta: ctx.requestSchedulingMeta,
        hasPendingProposal: ctx.hasPendingProposal,
        wizardCtx: ctx,
        lifecyclePhase: ctx.lifecyclePhase,
      });
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
    try {
      const resolved = resolveWizardPickupHandoffStep(ctx);
      logPickupHandoffRouting({
        rentalId: ctx.rentalId,
        logicalStep: resolved.step,
        completion: resolved.completion,
        resolverReason: resolved.reason,
      });
      if (ctx.schemaDegraded && resolved.step === 'rental_authorization') {
        return resolveFallbackLogicalWizardStep(ctx);
      }
      return normalizeMeetupWizardStep(resolved.step, ctx);
    } catch (err) {
      logRentalActivationSchema({
        rentalId: ctx.rentalId,
        wizardBuildPhase: 'routing_resolve',
        resolverCrashLocation: 'resolveWizardPickupHandoffStep',
        schemaDegraded: true,
        error: err instanceof Error ? err.message : String(err),
      });
      return resolveFallbackLogicalWizardStep(ctx);
    }
  }

  if (canShowWizardActiveRental(ctx)) {
    return 'active_rental';
  }

  return 'prepare_pickup';
}

/** Never throw — falls back to safe step when schema/resolvers fail. */
export function safeResolveLogicalWizardStep(ctx: RentalWizardContext): RentalWizardStep {
  if (ctx.schemaDegraded) {
    const fallback = resolveFallbackLogicalWizardStep(ctx);
    logRentalActivationSchema({
      rentalId: ctx.rentalId,
      wizardBuildPhase: 'routing_resolve',
      schemaDegraded: true,
      missingColumns: ctx.missingActivationColumns,
      resolverCrashLocation: 'schema_degraded_fallback',
    });
    return fallback;
  }
  try {
    return resolveLogicalWizardStepInner(ctx);
  } catch (err) {
    const fallback = resolveFallbackLogicalWizardStep(ctx);
    logRentalActivationSchema({
      rentalId: ctx.rentalId,
      wizardBuildPhase: 'routing_resolve',
      resolverCrashLocation: 'resolveLogicalWizardStep',
      schemaDegraded: true,
      error: err instanceof Error ? err.message : String(err),
    });
    return fallback;
  }
}

export function resolveLogicalWizardStep(ctx: RentalWizardContext): RentalWizardStep {
  return safeResolveLogicalWizardStep(ctx);
}

function mergeDevWizardContext(ctx: RentalWizardContext): RentalWizardContext {
  if (!DEV_TOOLS_ENABLED) return ctx;
  const local = getDevLocalWizardProgress();
  if (Object.keys(local).length === 0) return ctx;
  return { ...ctx, wizardProgress: { ...ctx.wizardProgress, ...local } };
}

export function safeResolveRentalWizardDestination(
  ctx: RentalWizardContext,
  nowMs = getEffectiveNowMs()
): RentalWizardDestination {
  try {
    return resolveRentalWizardDestinationInner(ctx, nowMs);
  } catch (err) {
    const fallbackStep = resolveFallbackLogicalWizardStep(ctx);
    logRentalActivationSchema({
      rentalId: ctx.rentalId,
      wizardBuildPhase: 'destination_resolve',
      resolverCrashLocation: 'resolveRentalWizardDestination',
      schemaDegraded: true,
      error: err instanceof Error ? err.message : String(err),
    });
    const meta = WIZARD_STEP_META[fallbackStep];
    return {
      step: fallbackStep,
      ctaLabel: meta?.ctaLabel ?? 'Continue',
      path: wizardPathForStep(ctx.rentalId, fallbackStep),
    };
  }
}

export function resolveRentalWizardDestination(
  ctx: RentalWizardContext,
  nowMs = getEffectiveNowMs()
): RentalWizardDestination {
  return safeResolveRentalWizardDestination(ctx, nowMs);
}

function resolveRentalWizardDestinationInner(
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
  const logical = normalizeMeetupWizardStep(safeResolveLogicalWizardStep(merged), merged);
  const transition = resolveWizardTransitionBefore(logical, merged, nowMs);
  const step = normalizeMeetupWizardStep(transition ?? logical, merged);
  const meta = WIZARD_STEP_META[step];
  if (!meta) {
    const fallbackStep = resolveFallbackLogicalWizardStep(merged);
    const fallbackMeta = WIZARD_STEP_META[fallbackStep];
    logRentalActivationSchema({
      rentalId: merged.rentalId,
      wizardBuildPhase: 'destination_resolve',
      resolverCrashLocation: 'WIZARD_STEP_META_missing',
      error: `unknown step: ${step}`,
    });
    return {
      step: fallbackStep,
      ctaLabel: fallbackMeta.ctaLabel,
      path: wizardPathForStep(ctx.rentalId, fallbackStep),
    };
  }
  logScenario('routing', {
    event: 'wizard_destination_resolved',
    rentalId: merged.rentalId,
    source: 'resolveRentalWizardDestination',
    logicalStep: logical,
    transitionStep: transition,
    step,
    path: wizardPathForStep(ctx.rentalId, step),
  });
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
export { isPickupHandoffBilaterallyComplete } from '@/lib/rentalOperationalAttention';
export { isReturnBilaterallyComplete };
