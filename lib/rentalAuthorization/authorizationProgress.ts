import {
  resolveRentalActivationState,
  type RentalActivationRentalSlice,
  type RentalActivationWizardSlice,
} from '@/lib/rentalActivation';
import { buildPickupHandoffCompletionInputFromWizard } from '@/lib/pickupHandoffCompletion';
import type { RentalWizardContext, RentalWizardProgress, RentalWizardRentalRow } from '@/lib/rentalWizard/types';

function parseTs(v: string | null | undefined): boolean {
  return Boolean(v?.trim() && Number.isFinite(Date.parse(v.trim())));
}

export type AuthorizationProgress = {
  pickupInspectionComplete: boolean;
  equipmentConditionAcknowledged: boolean;
  rentalAgreementReviewed: boolean;
  liabilityDisclosuresAccepted: boolean;
  securityHoldAuthorized: boolean;
  digitalSignatureComplete: boolean;
  rentalActivated: boolean;
  physicalPossessionConfirmed: boolean;
  /** Agreement + disclosures (may complete before meetup). */
  preMeetupLegalComplete: boolean;
  /** All items required for activation. */
  activationReady: boolean;
};

export function resolveAuthorizationProgressFromParts(input: {
  rental: RentalActivationRentalSlice &
    Pick<
      RentalWizardRentalRow,
      | 'equipment_condition_acknowledged_at'
      | 'liability_disclosure_acknowledged_at'
      | 'late_fee_policy_acknowledged_at'
      | 'protection_declined_acknowledged_at'
      | 'protection_coverage_acknowledged'
    >;
  wizard?: RentalActivationWizardSlice &
    Pick<
      RentalWizardProgress,
      | 'rental_agreement_acknowledged_at'
      | 'equipment_condition_acknowledged_at'
      | 'liability_disclosure_acknowledged_at'
      | 'late_fee_policy_acknowledged_at'
      | 'protection_declined_acknowledged_at'
    > | null;
  physicalPossessionConfirmed: boolean;
  rentalActivated: boolean;
  pickupInspectionComplete: boolean;
}): AuthorizationProgress {
  const { rental, wizard } = input;

  const equipmentConditionAcknowledged =
    parseTs(rental.equipment_condition_acknowledged_at) ||
    parseTs(wizard?.equipment_condition_acknowledged_at);

  const rentalAgreementReviewed =
    parseTs(rental.agreement_acknowledged_at) || parseTs(wizard?.rental_agreement_acknowledged_at);

  const liabilityDisclosuresAccepted =
    parseTs(rental.liability_disclosure_acknowledged_at) &&
    parseTs(rental.late_fee_policy_acknowledged_at) &&
    (parseTs(rental.protection_declined_acknowledged_at) ||
      rental.protection_coverage_acknowledged === true ||
      parseTs(wizard?.liability_disclosure_acknowledged_at));

  const preauth = String(rental.preauth_status ?? 'not_started').trim().toLowerCase();
  const securityHoldAuthorized =
    preauth === 'authorized' && parseTs(rental.preauth_authorized_at);

  const digitalSignatureComplete =
    parseTs(rental.signed_at) && rental.handoff_approved_by_renter === true;

  const preMeetupLegalComplete = rentalAgreementReviewed && liabilityDisclosuresAccepted;

  const activationReady =
    input.pickupInspectionComplete &&
    equipmentConditionAcknowledged &&
    rentalAgreementReviewed &&
    liabilityDisclosuresAccepted &&
    securityHoldAuthorized &&
    digitalSignatureComplete;

  return {
    pickupInspectionComplete: input.pickupInspectionComplete,
    equipmentConditionAcknowledged,
    rentalAgreementReviewed,
    liabilityDisclosuresAccepted,
    securityHoldAuthorized,
    digitalSignatureComplete,
    rentalActivated: input.rentalActivated,
    physicalPossessionConfirmed: input.physicalPossessionConfirmed,
    preMeetupLegalComplete,
    activationReady,
  };
}

export function resolveAuthorizationProgress(ctx: RentalWizardContext): AuthorizationProgress {
  const handoffInput = buildPickupHandoffCompletionInputFromWizard(ctx);
  const activation = resolveRentalActivationState(handoffInput);
  return resolveAuthorizationProgressFromParts({
    rental: ctx.rental,
    wizard: ctx.wizardProgress,
    physicalPossessionConfirmed: activation.physical.physicalPossessionConfirmed,
    rentalActivated: activation.rentalActivated,
    pickupInspectionComplete: activation.physical.pickupInspectionComplete,
  });
}

export function authorizationFlowStarted(ctx: RentalWizardContext): boolean {
  const p = resolveAuthorizationProgress(ctx);
  return (
    p.rentalAgreementReviewed ||
    p.liabilityDisclosuresAccepted ||
    p.equipmentConditionAcknowledged ||
    p.securityHoldAuthorized ||
    p.digitalSignatureComplete
  );
}

export function canReviewAgreementBeforeMeetup(ctx: RentalWizardContext): boolean {
  return ctx.meetupCoordinationComplete && !resolveAuthorizationProgress(ctx).rentalActivated;
}
