import {
  authorizationFlowStarted,
  resolveAuthorizationProgress,
  type AuthorizationProgress,
} from '@/lib/rentalAuthorization/authorizationProgress';
import type { RentalWizardContext, RentalWizardStep } from '@/lib/rentalWizard/types';

/** Next authorization step — linear flow, no milestone detours. */
export function resolveAuthorizationWizardStep(ctx: RentalWizardContext): RentalWizardStep {
  const p = resolveAuthorizationProgress(ctx);

  if (!p.rentalAgreementReviewed || !p.liabilityDisclosuresAccepted) {
    return 'rental_agreement';
  }

  if (!p.securityHoldAuthorized) {
    return 'security_hold_authorization';
  }

  if (!p.digitalSignatureComplete) {
    return 'digital_signature';
  }

  if (!p.rentalActivated) {
    return 'rental_activation';
  }

  return 'transition_enjoy_rental';
}

export function resolveAuthorizationDeepLinkStep(ctx: RentalWizardContext): RentalWizardStep {
  if (!canAccessAuthorizationEarly(ctx) && !authorizationFlowStarted(ctx)) {
    return 'prepare_pickup';
  }
  return resolveAuthorizationWizardStep(ctx);
}

export function canAccessAuthorizationEarly(ctx: RentalWizardContext): boolean {
  return ctx.meetupCoordinationComplete;
}

const PRE_MEETUP_ONLY_FALLTHROUGH = new Set<RentalWizardStep>([
  'rental_authorization',
  'liability_disclosures',
  'rental_agreement_intro',
  'rental_agreement',
  'transition_agreement_reviewed',
  'transition_disclosures_complete',
]);

/** Both parties marked at the meetup — authorization continues in the wizard, not meetup_day. */
export function bothPartiesAtMeetup(ctx: RentalWizardContext): boolean {
  const renterAtMeetup = Boolean(
    ctx.wizardProgress.renter_pickup_im_here_at?.trim() || ctx.rental.renter_arrived_at?.trim()
  );
  const ownerAtMeetup = Boolean(ctx.rental.owner_arrived_at?.trim());
  return renterAtMeetup && ownerAtMeetup;
}

/**
 * Pickup handoff routing: when pre-meetup legal is done but possession is not, defer to
 * meetup/prep steps. At meetup, keep hold/signature/activation.
 */
export function resolveAuthorizationStepForPickupHandoff(
  ctx: RentalWizardContext
): RentalWizardStep | null {
  const step = resolveAuthorizationWizardStep(ctx);
  const p = resolveAuthorizationProgress(ctx);
  if (bothPartiesAtMeetup(ctx)) return step;
  if (shouldFallThroughPrePossessionAuth(p, step)) return null;
  return step;
}

function shouldFallThroughPrePossessionAuth(
  p: AuthorizationProgress,
  step: RentalWizardStep
): boolean {
  return (
    p.preMeetupLegalComplete &&
    !p.physicalPossessionConfirmed &&
    PRE_MEETUP_ONLY_FALLTHROUGH.has(step)
  );
}
