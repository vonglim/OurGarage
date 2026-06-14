import type { RentalWizardStep } from '@/lib/rentalWizard/types';

export const INSPECTION_INCOMPLETE_AUTH_MESSAGE =
  'Complete the in-person equipment inspection before authorizing this rental.';

export const BINDING_AUTHORIZATION_WIZARD_STEPS = [
  'rental_agreement',
  'security_hold_authorization',
  'digital_signature',
  'rental_activation',
] as const satisfies readonly RentalWizardStep[];

const BINDING_STEP_SET = new Set<RentalWizardStep>(BINDING_AUTHORIZATION_WIZARD_STEPS);

export function isBindingAuthorizationWizardStep(step: RentalWizardStep): boolean {
  return BINDING_STEP_SET.has(step);
}
