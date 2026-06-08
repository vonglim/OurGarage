import { resolveAuthorizationWizardStep } from '@/lib/rentalAuthorization/resolveAuthorizationWizardStep';
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
  if (AUTH_MILESTONE_STEPS.has(step)) {
    return resolveAuthorizationWizardStep(ctx);
  }

  switch (step) {
    case 'rental_agreement_intro':
    case 'liability_disclosures':
      return resolveAuthorizationWizardStep(ctx);
    case 'equipment_confirmation':
    case 'rental_authorization':
      return resolveAuthorizationWizardStep(ctx);
    default:
      return step;
  }
}
