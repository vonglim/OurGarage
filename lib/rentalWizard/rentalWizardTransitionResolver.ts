import { getEffectiveNowMs } from '@/lib/rentalSimulation/simulationClock';
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

function hasReturnSchedule(ctx: RentalWizardContext): boolean {
  const r = ctx.rental;
  for (const k of ['agreed_return_datetime', 'return_datetime', 'return_time'] as const) {
    const v = r[k];
    if (typeof v === 'string' && v.trim() !== '') return true;
  }
  return false;
}

function hasPickupSchedule(ctx: RentalWizardContext): boolean {
  const r = ctx.rental;
  for (const k of ['agreed_pickup_datetime', 'pickup_datetime', 'meetup_time'] as const) {
    const v = r[k];
    if (typeof v === 'string' && v.trim() !== '') return true;
  }
  return false;
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
  switch (logicalStep) {
    case 'coordinate_return':
      if (hasPickupSchedule(ctx) && ctx.meetingCompleted && !hasSeen(ctx, 'pickup_confirmed_seen')) {
        return 'transition_pickup_confirmed';
      }
      break;
    case 'prepare_pickup':
      if (ctx.meetingCompleted && hasReturnSchedule(ctx) && !hasSeen(ctx, 'all_set_seen')) {
        return 'transition_all_set';
      }
      break;
    case 'meetup_day':
      if (
        (ctx.rental.owner_pickup_ready || ctx.ownerPickupPhotoCount > 0) &&
        !hasSeen(ctx, 'pickup_ready_seen')
      ) {
        return 'transition_pickup_ready';
      }
      break;
    case 'active_rental':
      if (ctx.pickupHandoffComplete && !hasSeen(ctx, 'enjoy_rental_seen')) {
        return 'transition_enjoy_rental';
      }
      if (isWithin24hBeforeReturn(ctx, nowMs) && !hasSeen(ctx, 'return_reminder_seen')) {
        return 'transition_return_reminder';
      }
      break;
    case 'prepare_return':
      if (isWithin24hBeforeReturn(ctx, nowMs) && !hasSeen(ctx, 'return_reminder_seen')) {
        return 'transition_return_reminder';
      }
      break;
    case 'leave_review':
      if (ctx.returnHandoffComplete && !hasSeen(ctx, 'return_complete_seen')) {
        return 'transition_return_complete';
      }
      break;
    default:
      break;
  }
  return null;
}

export function transitionKeyForStep(step: RentalWizardStep): RentalWizardTransitionKey | null {
  switch (step) {
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
