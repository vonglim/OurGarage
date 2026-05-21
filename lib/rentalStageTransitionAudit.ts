import { logScenario } from '@/lib/rentalLifecycle/scenarioDevLog';
import {
  isPickupCoordinationCompleteFromRow,
  isReturnCoordinationCompleteFromRow,
} from '@/lib/rentalOwnerWorkspacePhase';

export type RentalStageTransitionAuditRow = {
  agreement_status?: string | null;
  agreed_pickup_datetime?: string | null;
  agreed_return_datetime?: string | null;
};

/** Bilateral pickup + return accepted on the rental row (no wizard ack). */
export function isMeetupCoordinationCompleteFromRow(rental: RentalStageTransitionAuditRow): boolean {
  return (
    isPickupCoordinationCompleteFromRow(rental) && isReturnCoordinationCompleteFromRow(rental)
  );
}

export type RentalStageTransitionAuditInput = {
  rentalId: string;
  triggeredBy: string;
  transitionReason: string;
  resolvedOwnerPhase?: string | null;
  resolvedRenterPhase?: string | null;
  rental: RentalStageTransitionAuditRow;
  pickupComplete?: boolean;
  returnComplete?: boolean;
  meetupComplete?: boolean;
};

/** DEV: cross-surface lifecycle gate audit — pickup/return/meetup vs owner & renter phases. */
export function logRentalStageTransitionAudit(input: RentalStageTransitionAuditInput): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;

  const pickupComplete =
    input.pickupComplete ?? isPickupCoordinationCompleteFromRow(input.rental);
  const returnComplete =
    input.returnComplete ?? isReturnCoordinationCompleteFromRow(input.rental);
  const meetupComplete =
    input.meetupComplete ?? (pickupComplete && returnComplete);

  logScenario('lifecycle', {
    event: 'rental_stage_transition_audit',
    tag: 'rental-stage-transition-audit',
    rentalId: input.rentalId,
    triggeredBy: input.triggeredBy,
    transitionReason: input.transitionReason,
    resolvedOwnerPhase: input.resolvedOwnerPhase ?? null,
    resolvedRenterPhase: input.resolvedRenterPhase ?? null,
    pickupComplete,
    returnComplete,
    meetupComplete,
    agreement_status: input.rental.agreement_status ?? null,
    agreed_pickup_datetime: input.rental.agreed_pickup_datetime ?? null,
    agreed_return_datetime: input.rental.agreed_return_datetime ?? null,
  });
}
