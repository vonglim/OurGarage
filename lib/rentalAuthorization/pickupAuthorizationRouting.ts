import { isBindingAuthorizationWizardStep } from '@/lib/rentalAuthorization/bindingAuthorizationGate';
import {
  authorizationFlowStarted,
} from '@/lib/rentalAuthorization/authorizationProgress';
import {
  canAccessAuthorizationEarly,
  resolveAuthorizationWizardStep,
} from '@/lib/rentalAuthorization/resolveAuthorizationWizardStep';
import {
  buildPickupHandoffCompletionInputFromWizard,
  canAccessBindingAuthorizationForContext,
  resolvePickupHandoffCompletionState,
} from '@/lib/pickupHandoffCompletion';
import type { RentalWizardContext, RentalWizardStep } from '@/lib/rentalWizard/types';

function fallbackStepBeforeInspection(ctx: RentalWizardContext): RentalWizardStep {
  const completion = resolvePickupHandoffCompletionState(
    buildPickupHandoffCompletionInputFromWizard(ctx)
  );
  if (completion.bothPresent && !completion.renterConfirmedReceipt) {
    return 'owner_confirmed_arrival';
  }
  if (
    ctx.wizardProgress.renter_pickup_im_here_at?.trim() ||
    ctx.rental.renter_arrived_at?.trim()
  ) {
    return 'meetup_day';
  }
  return 'prepare_pickup';
}

export function resolveAuthorizationDeepLinkStepWithInspectionGate(
  ctx: RentalWizardContext
): RentalWizardStep {
  if (!canAccessAuthorizationEarly(ctx) && !authorizationFlowStarted(ctx)) {
    return 'prepare_pickup';
  }
  if (!canAccessBindingAuthorizationForContext(ctx)) {
    return fallbackStepBeforeInspection(ctx);
  }
  return resolveAuthorizationWizardStep(ctx);
}

export function resolveNormalizedAuthorizationWizardStep(ctx: RentalWizardContext): RentalWizardStep {
  if (!canAccessBindingAuthorizationForContext(ctx)) {
    if (isBindingAuthorizationWizardStep(resolveAuthorizationWizardStep(ctx))) {
      return fallbackStepBeforeInspection(ctx);
    }
  }
  return resolveAuthorizationWizardStep(ctx);
}
