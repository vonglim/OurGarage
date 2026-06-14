import {
  resolveNormalizedAuthorizationWizardStep,
} from '@/lib/rentalAuthorization/pickupAuthorizationRouting';
import { isBindingAuthorizationWizardStep } from '@/lib/rentalAuthorization/bindingAuthorizationGate';
import { canAccessBindingAuthorizationForContext } from '@/lib/pickupHandoffCompletion';
import type { RentalWizardContext, RentalWizardStep } from '@/lib/rentalWizard/types';

const AUTH_MILESTONE_STEPS = new Set<RentalWizardStep>([
  'transition_agreement_reviewed',
  'transition_disclosures_complete',
  'transition_hold_authorized',
  'transition_agreement_signed',
  'transition_rental_activated',
]);

/**
 * Collapse retired intro/milestone/hub steps into the canonical purple → orange → green path.
 */
export function normalizeMeetupWizardStep(
  step: RentalWizardStep,
  ctx: RentalWizardContext
): RentalWizardStep {
  if (isBindingAuthorizationWizardStep(step) && !canAccessBindingAuthorizationForContext(ctx)) {
    return resolveNormalizedAuthorizationWizardStep(ctx);
  }

  if (AUTH_MILESTONE_STEPS.has(step)) {
    return resolveNormalizedAuthorizationWizardStep(ctx);
  }

  switch (step) {
    case 'rental_agreement_intro':
    case 'liability_disclosures':
      return resolveNormalizedAuthorizationWizardStep(ctx);
    case 'equipment_confirmation':
    case 'rental_authorization':
      return resolveNormalizedAuthorizationWizardStep(ctx);
    default:
      return step;
  }
}
