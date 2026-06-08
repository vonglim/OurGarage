/** Current published rental agreement template version. */
export const RENTAL_AGREEMENT_VERSION = 1;

/** Liability / policy disclosure bundle version (paired with agreement). */
export const LIABILITY_DISCLOSURE_VERSION = 1;

export const AUTHORIZATION_WIZARD_STEPS = [
  'rental_agreement_intro',
  'rental_agreement',
  'liability_disclosures',
  'security_hold_authorization',
  'digital_signature',
  'rental_activation',
] as const;

export type AuthorizationWizardStep = (typeof AUTHORIZATION_WIZARD_STEPS)[number];

export function isAuthorizationWizardStep(step: string): step is AuthorizationWizardStep {
  return (AUTHORIZATION_WIZARD_STEPS as readonly string[]).includes(step);
}
