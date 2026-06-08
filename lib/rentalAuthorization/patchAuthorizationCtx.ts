import type { RentalWizardContext } from '@/lib/rentalWizard/types';

/** Keep in-memory wizard ctx aligned with DB so step auto-correction does not bounce back. */
export function patchAgreementReviewOnCtx(ctx: RentalWizardContext, at: string): void {
  ctx.rental.agreement_acknowledged_at = at;
  ctx.rental.equipment_condition_acknowledged_at = at;
  ctx.wizardProgress.rental_agreement_acknowledged_at = at;
  ctx.wizardProgress.equipment_condition_acknowledged_at = at;
}

export function patchLiabilityDisclosuresOnCtx(
  ctx: RentalWizardContext,
  at: string,
  input: {
    protectionCoverageAccepted: boolean;
    protectionDeclinedAcknowledged: boolean;
    riskInitials: string;
  }
): void {
  ctx.rental.liability_disclosure_acknowledged_at = at;
  ctx.rental.late_fee_policy_acknowledged_at = at;
  ctx.wizardProgress.liability_disclosure_acknowledged_at = at;
  ctx.wizardProgress.late_fee_policy_acknowledged_at = at;
  ctx.wizardProgress.liability_risk_initials = input.riskInitials.trim();
  ctx.rental.protection_coverage_acknowledged = input.protectionCoverageAccepted;
  if (input.protectionDeclinedAcknowledged) {
    ctx.rental.protection_declined_acknowledged_at = at;
    ctx.wizardProgress.protection_declined_acknowledged_at = at;
  }
}

export function patchSecurityHoldOnCtx(ctx: RentalWizardContext, at: string, amount: number): void {
  ctx.rental.preauth_status = 'authorized';
  ctx.rental.preauth_authorized_at = at;
  ctx.rental.preauth_amount = amount;
}

export function patchDigitalSignatureOnCtx(ctx: RentalWizardContext, at: string, signedName: string): void {
  ctx.rental.signed_at = at;
  ctx.rental.handoff_approved_by_renter = true;
  ctx.rental.signed_name = signedName;
}
