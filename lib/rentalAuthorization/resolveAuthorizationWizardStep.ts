import { resolveAuthorizationProgress } from '@/lib/rentalAuthorization/authorizationProgress';
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

export function canAccessAuthorizationEarly(ctx: RentalWizardContext): boolean {
  return ctx.meetupCoordinationComplete;
}

/** Both parties marked at the meetup — authorization continues in the wizard, not meetup_day. */
export function bothPartiesAtMeetup(ctx: RentalWizardContext): boolean {
  const renterAtMeetup = Boolean(
    ctx.wizardProgress.renter_pickup_im_here_at?.trim() || ctx.rental.renter_arrived_at?.trim()
  );
  const ownerAtMeetup = Boolean(ctx.rental.owner_arrived_at?.trim());
  return renterAtMeetup && ownerAtMeetup;
}
