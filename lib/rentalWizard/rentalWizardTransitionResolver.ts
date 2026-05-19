import { logScenario } from '@/lib/rentalLifecycle/scenarioDevLog';
import { getEffectiveNowMs } from '@/lib/rentalSimulation/simulationClock';
import { isMeetupCoordinationComplete, isPickupCoordinationComplete } from '@/lib/rentalWizard/rentalWizardGates';
import type { RentalWizardContext, RentalWizardStep, RentalWizardTransitionKey } from '@/lib/rentalWizard/types';

const MS_24H = 24 * 60 * 60 * 1000;

function hasSeen(ctx: RentalWizardContext, key: RentalWizardTransitionKey): boolean {
  return ctx.seenTransitions.has(key);
}

function isWithin24hBeforeReturn(ctx: RentalWizardContext, nowMs = getEffectiveNowMs()): boolean {
  const iso = ctx.returnIso;
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  const ms = t - nowMs;
  return ms > 0 && ms <= MS_24H;
}

/**
 * If a one-time transition should appear before `logicalStep`, return it.
 * Otherwise null (go straight to logical step).
 */
export function resolveWizardTransitionBefore(
  logicalStep: RentalWizardStep,
  ctx: RentalWizardContext,
  nowMs = getEffectiveNowMs()
): RentalWizardStep | null {
  if (!hasSeen(ctx, 'rental_confirmed_seen') && !isPickupCoordinationComplete(ctx)) {
    const transition: RentalWizardStep = 'transition_rental_confirmed';
    logScenario('transition', {
      event: 'overlay_resolved',
      rentalId: ctx.rentalId,
      logicalStep,
      transitionStep: transition,
      seenKeys: [...ctx.seenTransitions],
    });
    return transition;
  }

  let transition: RentalWizardStep | null = null;

  switch (logicalStep) {
    case 'coordinate_pickup':
    case 'coordinate_return':
    case 'prepare_pickup':
      if (isPickupCoordinationComplete(ctx) && !hasSeen(ctx, 'pickup_confirmed_seen')) {
        transition = 'transition_pickup_confirmed';
      } else if (isMeetupCoordinationComplete(ctx) && !hasSeen(ctx, 'all_set_seen')) {
        transition = 'transition_all_set';
      }
      break;
    case 'meetup_day':
      if (
        (ctx.rental.owner_pickup_ready || ctx.ownerPickupPhotoCount > 0) &&
        !hasSeen(ctx, 'pickup_ready_seen')
      ) {
        transition = 'transition_pickup_ready';
      }
      break;
    case 'active_rental':
      if (ctx.pickupHandoffComplete && !hasSeen(ctx, 'enjoy_rental_seen')) {
        transition = 'transition_enjoy_rental';
      } else if (isWithin24hBeforeReturn(ctx, nowMs) && !hasSeen(ctx, 'return_reminder_seen')) {
        transition = 'transition_return_reminder';
      }
      break;
    case 'prepare_return':
      if (isWithin24hBeforeReturn(ctx, nowMs) && !hasSeen(ctx, 'return_reminder_seen')) {
        transition = 'transition_return_reminder';
      }
      break;
    case 'leave_review':
      if (ctx.returnHandoffComplete && !hasSeen(ctx, 'return_complete_seen')) {
        transition = 'transition_return_complete';
      }
      break;
    default:
      break;
  }

  if (transition) {
    logScenario('transition', {
      event: 'overlay_resolved',
      rentalId: ctx.rentalId,
      logicalStep,
      transitionStep: transition,
      seenKeys: [...ctx.seenTransitions],
    });
  }

  return transition;
}

export function transitionKeyForStep(step: RentalWizardStep): RentalWizardTransitionKey | null {
  switch (step) {
    case 'transition_rental_confirmed':
      return 'rental_confirmed_seen';
    case 'transition_pickup_confirmed':
      return 'pickup_confirmed_seen';
    case 'transition_all_set':
      return 'all_set_seen';
    case 'transition_pickup_ready':
      return 'pickup_ready_seen';
    case 'transition_enjoy_rental':
      return 'enjoy_rental_seen';
    case 'transition_return_reminder':
      return 'return_reminder_seen';
    case 'transition_return_complete':
      return 'return_complete_seen';
    default:
      return null;
  }
}
