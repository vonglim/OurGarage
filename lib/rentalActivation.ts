import {
  resolvePickupHandoffCompletionState,
  type PickupHandoffCompletionInput,
  type PickupHandoffCompletionState,
} from '@/lib/pickupHandoffCompletion';

export type RentalAuthorizationPhase =
  | 'locked'
  | 'pending_agreement_review'
  | 'pending_preauthorization'
  | 'pending_signature'
  | 'authorized'
  | 'failed_authorization';

export type RentalActivationRentalSlice = {
  handoff_approval_started_at?: string | null;
  handoff_approved_by_owner?: boolean | null;
  handoff_approved_by_renter?: boolean | null;
  signed_at?: string | null;
  signed_name?: string | null;
  preauth_status?: string | null;
  preauth_authorized_at?: string | null;
  physical_possession_confirmed_at?: string | null;
  rental_activated_at?: string | null;
  agreement_acknowledged_at?: string | null;
};

export type RentalActivationWizardSlice = {
  rental_agreement_acknowledged_at?: string | null;
};

export type PhysicalPossessionState = PickupHandoffCompletionState & {
  physicalPossessionConfirmed: boolean;
};

export type RentalAuthorizationState = {
  phase: RentalAuthorizationPhase;
  phaseLabel: string;
  agreementAcknowledged: boolean;
  preauthorizationSucceeded: boolean;
  preauthorizationFailed: boolean;
  signaturesComplete: boolean;
  authorizationReady: boolean;
};

export type RentalActivationState = {
  physical: PhysicalPossessionState;
  authorization: RentalAuthorizationState;
  /** Legal rental active — equipment-out / enjoy rental. */
  rentalActivated: boolean;
  /** @deprecated Use rentalActivated — kept for call-site migration. */
  handoffComplete: boolean;
};

function parseTs(v: string | null | undefined): boolean {
  return Boolean(v?.trim() && Number.isFinite(Date.parse(v.trim())));
}

function preauthStatusNorm(raw: string | null | undefined): string {
  return String(raw ?? 'not_started').trim().toLowerCase();
}

export function resolvePhysicalPossessionState(
  input: PickupHandoffCompletionInput
): PhysicalPossessionState {
  return resolvePickupHandoffCompletionState(input) as PhysicalPossessionState;
}

export function resolveRentalAuthorizationState(input: {
  rental: RentalActivationRentalSlice;
  wizard?: RentalActivationWizardSlice | null;
  physicalPossessionConfirmed: boolean;
}): RentalAuthorizationState {
  const { rental, wizard } = input;

  if (!input.physicalPossessionConfirmed) {
    return {
      phase: 'locked',
      phaseLabel: 'Complete pickup inspection first',
      agreementAcknowledged: false,
      preauthorizationSucceeded: false,
      preauthorizationFailed: false,
      signaturesComplete: false,
      authorizationReady: false,
    };
  }

  const agreementAcknowledged =
    parseTs(rental.agreement_acknowledged_at) ||
    parseTs(wizard?.rental_agreement_acknowledged_at);

  const preauth = preauthStatusNorm(rental.preauth_status);
  const preauthorizationFailed = preauth === 'failed';
  const preauthorizationSucceeded =
    preauth === 'authorized' && parseTs(rental.preauth_authorized_at);
  const signaturesComplete =
    parseTs(rental.signed_at) && rental.handoff_approved_by_renter === true;

  const handoffStarted = Boolean(
    rental.handoff_approval_started_at?.trim() || rental.handoff_approved_by_owner === true
  );

  let phase: RentalAuthorizationPhase = 'pending_agreement_review';
  if (!agreementAcknowledged) {
    phase = 'pending_agreement_review';
  } else if (preauthorizationFailed) {
    phase = 'failed_authorization';
  } else if (!handoffStarted || preauth === 'not_started') {
    phase = 'pending_preauthorization';
  } else if (preauth === 'pending' && !preauthorizationSucceeded) {
    phase = 'pending_preauthorization';
  } else if (!signaturesComplete) {
    phase = 'pending_signature';
  } else if (preauthorizationSucceeded && signaturesComplete) {
    phase = 'authorized';
  } else {
    phase = 'pending_signature';
  }

  const phaseLabel =
    phase === 'pending_agreement_review'
      ? 'Review agreement'
      : phase === 'pending_preauthorization'
        ? 'Authorize payment hold'
        : phase === 'pending_signature'
          ? 'Sign to activate'
          : phase === 'authorized'
            ? 'Authorized'
            : phase === 'failed_authorization'
              ? 'Authorization failed'
              : 'Rental authorization';

  const authorizationReady =
    agreementAcknowledged && preauthorizationSucceeded && signaturesComplete;

  return {
    phase,
    phaseLabel,
    agreementAcknowledged,
    preauthorizationSucceeded,
    preauthorizationFailed,
    signaturesComplete,
    authorizationReady,
  };
}

/**
 * Canonical legal rental activation — wizard routing, workspace active stage, sticky footer.
 */
export function resolveRentalActivationState(
  input: PickupHandoffCompletionInput & {
    wizard?: RentalActivationWizardSlice | null;
  }
): RentalActivationState {
  const physical = resolvePhysicalPossessionState(input);
  const authorization = resolveRentalAuthorizationState({
    rental: input.rental,
    wizard: input.wizard ?? null,
    physicalPossessionConfirmed: physical.physicalPossessionConfirmed,
  });

  const rentalActivated =
    physical.physicalPossessionConfirmed &&
    physical.bothPresent &&
    physical.evidenceReviewed &&
    physical.allChecklistComplete &&
    physical.pickupInspectionComplete &&
    physical.renterConfirmedReceipt &&
    authorization.signaturesComplete &&
    authorization.preauthorizationSucceeded &&
    parseTs(input.rental.rental_activated_at);

  return {
    physical,
    authorization,
    rentalActivated,
    handoffComplete: rentalActivated,
  };
}

export function logRentalActivation(input: {
  rentalId: string;
  surface: string;
  activation: RentalActivationState;
  transitionReason?: string;
}): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  const { physical: p, authorization: a } = input.activation;
  console.log('[rental-activation]', {
    rentalId: input.rentalId,
    surface: input.surface,
    transitionReason: input.transitionReason ?? null,
    physicalPossessionConfirmed: p.physicalPossessionConfirmed,
    rentalActivated: input.activation.rentalActivated,
    authorizationPhase: a.phase,
    agreementAcknowledged: a.agreementAcknowledged,
    preauthorizationSucceeded: a.preauthorizationSucceeded,
    signaturesComplete: a.signaturesComplete,
    bothPresent: p.bothPresent,
    evidenceReviewed: p.evidenceReviewed,
    allChecklistComplete: p.allChecklistComplete,
    pickupInspectionComplete: p.pickupInspectionComplete,
    renterConfirmedReceipt: p.renterConfirmedReceipt,
  });
}
