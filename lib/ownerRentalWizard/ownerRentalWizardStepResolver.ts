import { isRentalCancelled } from '@/lib/rentalCancellation';
import {
  resolveMeetupLifecyclePhase,
  resolveMeetupLifecyclePresentation,
} from '@/lib/rentalLifecycle/meetupLifecycle';
import {
  buildPickupHandoffCompletionInputFromWizard,
} from '@/lib/pickupHandoffCompletion';
import type {
  OwnerRentalWizardContext,
  OwnerRentalWizardDestination,
  OwnerRentalWizardStep,
} from '@/lib/ownerRentalWizard/types';
import {
  OWNER_WIZARD_STEP_META,
  ownerWizardPathForStep,
} from '@/lib/ownerRentalWizard/ownerWizardStepMeta';
import { resolveRentalActivationState } from '@/lib/rentalActivation';
import {
  canShowWizardActiveRental,
  isMeetupCoordinationComplete,
  isPickupCoordinationComplete,
  isWizardReturnPhase,
} from '@/lib/rentalWizard/rentalWizardGates';
import { resolveWizardTransitionBefore } from '@/lib/rentalWizard/rentalWizardTransitionResolver';
import type { RentalWizardStep } from '@/lib/rentalWizard/types';

function resolveOwnerPickupHandoffStep(ctx: OwnerRentalWizardContext): OwnerRentalWizardStep {
  const handoffInput = buildPickupHandoffCompletionInputFromWizard(ctx);
  const activation = resolveRentalActivationState(handoffInput);
  const completion = activation.physical;
  const meetupPhase = resolveMeetupLifecyclePhase(ctx);

  if (activation.rentalActivated) {
    return 'transition_rental_active';
  }

  if (meetupPhase === 'rental_authorization') {
    return 'owner_authorization_observe';
  }

  if (meetupPhase === 'rental_active') {
    return 'transition_rental_active';
  }

  const ownerReady =
    ctx.rental.owner_pickup_ready === true || ctx.rental.handoff_approved_by_owner === true;
  const handoffStarted = Boolean(
    ctx.rental.handoff_approval_started_at?.trim() || ctx.rental.handoff_approved_by_owner
  );

  if (!handoffStarted && !ownerReady) {
    return 'owner_prepare_pickup';
  }

  if (!completion.renterConfirmedReceipt) {
    return 'owner_meetup_handoff';
  }

  return 'owner_authorization_observe';
}

function resolveOwnerLogicalWizardStepInner(ctx: OwnerRentalWizardContext): OwnerRentalWizardStep {
  if (isRentalCancelled(ctx.rental)) return 'cancelled';

  const st = String(ctx.rental.status ?? 'pending').trim().toLowerCase();
  if (st === 'returned' || st === 'completed') return 'leave_review';

  if (isWizardReturnPhase(ctx)) {
    if (ctx.returnHandoffComplete) return 'leave_review';
    if (ctx.wizardProgress.renter_return_im_here_at) return 'owner_return_handoff';
    return 'owner_prepare_return';
  }

  if (!isPickupCoordinationComplete(ctx)) return 'coordinate_pickup';
  if (!isMeetupCoordinationComplete(ctx)) return 'coordinate_return';

  if (!ctx.pickupHandoffComplete) {
    return resolveOwnerPickupHandoffStep(ctx);
  }

  if (canShowWizardActiveRental(ctx)) return 'owner_active_rental';
  return 'owner_active_rental';
}

function mapRenterTransitionToOwner(step: RentalWizardStep | null): OwnerRentalWizardStep | null {
  if (!step) return null;
  const map: Partial<Record<RentalWizardStep, OwnerRentalWizardStep>> = {
    transition_rental_confirmed: 'transition_rental_confirmed',
    transition_pickup_confirmed: 'transition_pickup_confirmed',
    transition_return_confirmed: 'transition_return_confirmed',
    transition_all_set: 'transition_all_set',
    transition_pickup_ready: 'transition_pickup_ready',
    transition_enjoy_rental: 'transition_rental_active',
    transition_return_reminder: 'transition_return_reminder',
    transition_return_complete: 'transition_return_complete',
  };
  return map[step] ?? null;
}

function ownerStepForTransitionResolver(logical: OwnerRentalWizardStep): RentalWizardStep {
  if (logical === 'owner_prepare_pickup') return 'prepare_pickup';
  if (logical === 'owner_meetup_handoff') return 'meetup_day';
  return logical as unknown as RentalWizardStep;
}

export function resolveOwnerLogicalWizardStep(ctx: OwnerRentalWizardContext): OwnerRentalWizardStep {
  return resolveOwnerLogicalWizardStepInner(ctx);
}

export function resolveOwnerMeetupPresentation(ctx: OwnerRentalWizardContext) {
  return resolveMeetupLifecyclePresentation(ctx, 'owner');
}

export function resolveOwnerRentalWizardDestination(
  ctx: OwnerRentalWizardContext,
  nowMs?: number
): OwnerRentalWizardDestination {
  const logical = resolveOwnerLogicalWizardStepInner(ctx);
  const transition = mapRenterTransitionToOwner(
    resolveWizardTransitionBefore(ownerStepForTransitionResolver(logical), ctx, nowMs)
  );
  const step = transition ?? logical;
  const meta = OWNER_WIZARD_STEP_META[step];
  return {
    step,
    ctaLabel: meta.ctaLabel,
    path: ownerWizardPathForStep(ctx.rentalId, step),
  };
}
