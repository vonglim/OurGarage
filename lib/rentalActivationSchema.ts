import { evaluatePickupInspectionFlow } from '@/lib/pickupInspectionFlow';
import {
  resolvePickupHandoffCompletionState,
  type PickupHandoffCompletionInput,
  type PickupHandoffCompletionState,
} from '@/lib/pickupHandoffCompletion';
import {
  resolveRentalActivationState,
  type RentalActivationState,
} from '@/lib/rentalActivation';
import type { RentalWizardContext, RentalWizardRentalRow, RentalWizardStep } from '@/lib/rentalWizard/types';

/** Columns introduced in migrations 071–073; may be absent when db push failed. */
export const RENTAL_ACTIVATION_OPTIONAL_COLUMNS = [
  'physical_possession_confirmed_at',
  'rental_activated_at',
  'agreement_acknowledged_at',
  'signed_at',
  'preauth_status',
  'preauth_authorized_at',
  'renter_confirmed_receipt_at',
  'owner_confirmed_handoff_at',
  'possession_transferred_at',
  'pickup_handoff_completed_at',
  'owner_arrived_at',
  'renter_arrived_at',
  'equipment_condition_acknowledged_at',
  'liability_disclosure_acknowledged_at',
  'late_fee_policy_acknowledged_at',
  'signed_agreement_version',
  'signed_liability_disclosure_version',
] as const;

export type RentalActivationOptionalColumn = (typeof RENTAL_ACTIVATION_OPTIONAL_COLUMNS)[number];

export type RentalActivationSchemaLog = {
  rentalId: string;
  wizardBuildPhase?: string;
  resolverCrashLocation?: string;
  missingColumns?: string[];
  failedSelectFields?: string[];
  schemaDegraded?: boolean;
  error?: string;
};

const CONSERVATIVE_ACTIVATION: RentalActivationState = {
  physical: {
    ownerArrived: false,
    renterArrived: false,
    bothPresent: false,
    renterConfirmedReceipt: false,
    ownerConfirmedHandoff: false,
    possessionTransferred: false,
    signaturesRequired: false,
    signaturesComplete: false,
    evidenceReviewed: false,
    allChecklistComplete: false,
    pickupInspectionComplete: false,
    physicalPossessionConfirmed: false,
    handoffComplete: false,
    nextOperationalStep: 'prepare_pickup',
    inspection: evaluatePickupInspectionFlow({
      bothPresent: false,
      handoffApprovalStarted: false,
      handoffCompleted: false,
      renterArrived: false,
      evidenceReviewed: false,
      renterConfirmedReceipt: false,
      manualChecklist: {},
      viewerFlags: { reviewedOwnerPhotos: false, viewedTimestampProof: false },
      pickupRenterConfirmed: false,
    }),
  },
  authorization: {
    phase: 'locked',
    phaseLabel: 'Complete pickup inspection first',
    agreementAcknowledged: false,
    preauthorizationSucceeded: false,
    preauthorizationFailed: false,
    signaturesComplete: false,
    authorizationReady: false,
  },
  rentalActivated: false,
  handoffComplete: false,
};

export function logRentalActivationSchema(payload: RentalActivationSchemaLog): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  console.log('[rental-activation-schema]', payload);
}

export function parsePostgrestMissingColumn(
  error: { message?: string; details?: string; hint?: string } | null | undefined
): string | null {
  if (!error) return null;
  const msg = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`;
  const patterns = [
    /column ['"]?([\w.]+)['"]? does not exist/i,
    /Could not find the ['"](\w+)['"] column/i,
    /column rentals\.(\w+) does not exist/i,
  ];
  for (const re of patterns) {
    const m = msg.match(re);
    if (m?.[1]) return m[1].replace(/^rentals\./, '');
  }
  return null;
}

export function detectMissingActivationColumns(row: Record<string, unknown>): RentalActivationOptionalColumn[] {
  return RENTAL_ACTIVATION_OPTIONAL_COLUMNS.filter((col) => !(col in row));
}

export function isActivationSchemaDegraded(
  missingColumns: readonly RentalActivationOptionalColumn[]
): boolean {
  if (missingColumns.length === 0) return false;
  const critical: RentalActivationOptionalColumn[] = [
    'rental_activated_at',
    'physical_possession_confirmed_at',
    'owner_arrived_at',
    'renter_arrived_at',
  ];
  return missingColumns.some((c) => critical.includes(c));
}

export function normalizeRentalRowForWizard<T extends RentalWizardRentalRow>(row: T): T {
  const out = { ...row } as T & Record<string, null>;
  for (const col of RENTAL_ACTIVATION_OPTIONAL_COLUMNS) {
    if (!(col in out)) {
      (out as Record<string, unknown>)[col] = null;
    }
  }
  return out;
}

export function safeResolvePickupHandoffCompletionState(
  input: PickupHandoffCompletionInput,
  log: Omit<RentalActivationSchemaLog, 'rentalId'> & { rentalId: string }
): PickupHandoffCompletionState {
  try {
    return resolvePickupHandoffCompletionState(input);
  } catch (err) {
    logRentalActivationSchema({
      ...log,
      resolverCrashLocation: log.resolverCrashLocation ?? 'resolvePickupHandoffCompletionState',
      error: err instanceof Error ? err.message : String(err),
      schemaDegraded: true,
    });
    return CONSERVATIVE_ACTIVATION.physical;
  }
}

export function safeResolveRentalActivationState(
  input: PickupHandoffCompletionInput & { wizard?: { rental_agreement_acknowledged_at?: string | null } | null },
  log: Omit<RentalActivationSchemaLog, 'rentalId'> & { rentalId: string }
): RentalActivationState {
  try {
    const state = resolveRentalActivationState(input);
    if (log.schemaDegraded) {
      return {
        ...state,
        rentalActivated: false,
        handoffComplete: false,
      };
    }
    return state;
  } catch (err) {
    logRentalActivationSchema({
      ...log,
      resolverCrashLocation: log.resolverCrashLocation ?? 'resolveRentalActivationState',
      error: err instanceof Error ? err.message : String(err),
      schemaDegraded: true,
    });
    return CONSERVATIVE_ACTIVATION;
  }
}

/** Safe wizard step when resolvers fail or activation schema is incomplete. */
export function resolveFallbackLogicalWizardStep(ctx: RentalWizardContext): RentalWizardStep {
  const st = String(ctx.rental.status ?? 'pending').trim().toLowerCase();
  if (st === 'returned' || st === 'completed') return 'leave_review';

  if (!ctx.pickupCoordinationComplete) {
    if (!ctx.seenTransitions.has('rental_confirmed_seen')) {
      return 'transition_rental_confirmed';
    }
    return 'coordinate_pickup';
  }

  if (!ctx.meetupCoordinationComplete) {
    return 'coordinate_return';
  }

  return 'prepare_pickup';
}

export function pickupHandoffCompleteForContext(input: {
  rentalActivation: RentalActivationState;
  schemaDegraded: boolean;
  missingColumns: readonly RentalActivationOptionalColumn[];
}): boolean {
  if (input.schemaDegraded && input.missingColumns.includes('rental_activated_at')) {
    return false;
  }
  return input.rentalActivation.rentalActivated;
}
