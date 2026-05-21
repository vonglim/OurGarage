import { logScenario } from '@/lib/rentalLifecycle/scenarioDevLog';
import {
  deriveRentalWorkspaceLifecyclePhase,
  type RentalLifecyclePhase,
} from '@/lib/rentalLifecyclePhase';
import { resolveMeetupScheduleFromRow } from '@/lib/rentalMeetupCoordinationState';
import { logRentalStageTransitionAudit } from '@/lib/rentalStageTransitionAudit';

/** Owner-facing workspace lifecycle lane (UI orchestration — not DB status). */
export type OwnerWorkspacePhase =
  | 'request_pending'
  | 'approved'
  | 'pickup_coordination'
  | 'return_coordination'
  | 'pickup_prep'
  | 'on_rent'
  | 'return_handoff'
  | 'completed';

export type OwnerWorkspacePhaseInput = {
  rental: {
    id?: string;
    status?: string | null;
    agreement_status?: string | null;
    last_proposed_by?: string | null;
    owner_confirmed?: boolean | null;
    renter_confirmed?: boolean | null;
    signed_at?: string | null;
    meetup_location?: string | null;
    agreed_pickup_datetime?: string | null;
    agreed_return_datetime?: string | null;
  };
  pickupHandoffComplete: boolean;
  returnHandoffComplete?: boolean;
  requestSchedulingMeta?: unknown;
  /** When known (wizard_state) — return Screen 2 ack. */
  pickupReturnCoordinationAckAt?: string | null;
  pickupConfirmedSeen?: boolean;
};

export type OwnerWorkspacePhaseResolution = {
  resolvedOwnerPhase: OwnerWorkspacePhase;
  resolvedLifecyclePhase: RentalLifecyclePhase;
  agreement_status: string | null;
  pickupCoordinationComplete: boolean;
  pickupConfirmed: boolean;
  pickupHandoffComplete: boolean;
  activeRentalEligible: boolean;
  returnCoordinationEligible: boolean;
  returnCoordinationComplete: boolean;
  meetupCoordinationComplete: boolean;
  resolverReasoning: string[];
};

function isAgreementConfirmedOnRow(rental: OwnerWorkspacePhaseInput['rental']): boolean {
  if (rental.agreement_status !== 'confirmed') return false;
  return !String(rental.last_proposed_by ?? '').trim();
}

function hasAgreedPickupDatetime(rental: OwnerWorkspacePhaseInput['rental']): boolean {
  const v = rental.agreed_pickup_datetime?.trim();
  if (!v) return false;
  return Number.isFinite(Date.parse(v));
}

function hasMeetupLocation(rental: OwnerWorkspacePhaseInput['rental']): boolean {
  return Boolean(rental.meetup_location?.trim());
}

/** Bilateral pickup coordination accepted — canonical `agreed_pickup_datetime` + meetup location only. */
export function isPickupCoordinationCompleteFromRow(
  rental: OwnerWorkspacePhaseInput['rental']
): boolean {
  return hasAgreedPickupDatetime(rental) && hasMeetupLocation(rental);
}

/** Bilateral return coordination accepted — canonical `agreed_return_datetime` only (not operational/contract hints). */
export function isReturnCoordinationCompleteFromRow(rental: {
  agreed_return_datetime?: string | null;
}): boolean {
  const v = rental.agreed_return_datetime?.trim();
  if (!v) return false;
  return Number.isFinite(Date.parse(v));
}

export function resolveOwnerWorkspacePhase(
  input: OwnerWorkspacePhaseInput
): OwnerWorkspacePhaseResolution {
  const st = String(input.rental.status ?? 'pending').trim().toLowerCase();
  const agreementStatus = String(input.rental.agreement_status ?? '').trim() || null;
  const pendingProposal =
    agreementStatus === 'pending' && Boolean(String(input.rental.last_proposed_by ?? '').trim());
  const allConfirmed =
    input.rental.owner_confirmed === true && input.rental.renter_confirmed === true;
  const pickupCoordinationComplete = isPickupCoordinationCompleteFromRow(input.rental);
  const returnCoordinationComplete = isReturnCoordinationCompleteFromRow(input.rental);
  const meetupCoordinationComplete =
    pickupCoordinationComplete && returnCoordinationComplete;
  const pickupConfirmed = Boolean(input.pickupConfirmedSeen);
  const returnAck = Boolean(input.pickupReturnCoordinationAckAt?.trim());
  /** Return lane active after pickup bilateral — independent of operational/contract return hints. */
  const returnCoordinationEligible =
    pickupCoordinationComplete &&
    !returnCoordinationComplete &&
    !input.pickupHandoffComplete;
  const activeRentalEligible = input.pickupHandoffComplete;
  const resolvedLifecyclePhase = deriveRentalWorkspaceLifecyclePhase({
    status: input.rental.status,
    pickupHandoffComplete: input.pickupHandoffComplete,
  });

  const reasoning: string[] = [];
  let resolvedOwnerPhase: OwnerWorkspacePhase;

  if (st === 'cancelled') {
    resolvedOwnerPhase = 'completed';
    reasoning.push('status=cancelled → completed.');
  } else if (st === 'returned' || st === 'completed') {
    resolvedOwnerPhase = 'completed';
    reasoning.push(`status=${st} → completed.`);
  } else if (st === 'return_pending' || resolvedLifecyclePhase === 'return') {
    resolvedOwnerPhase = 'return_handoff';
    reasoning.push('return phase → return_handoff.');
  } else if (activeRentalEligible && resolvedLifecyclePhase === 'active') {
    resolvedOwnerPhase = 'on_rent';
    reasoning.push('pickupHandoffComplete=true → on_rent (active_rental eligible).');
  } else if (returnCoordinationEligible) {
    resolvedOwnerPhase = 'return_coordination';
    reasoning.push(
      'pickup coordinated, return not bilaterally agreed, handoff incomplete → return_coordination.'
    );
    if (!returnAck) reasoning.push('  renter may still need pickup_return_coordination_ack.');
    if (!pickupConfirmed) reasoning.push('  renter may still need pickup_confirmed_seen.');
  } else if (meetupCoordinationComplete && !input.pickupHandoffComplete) {
    resolvedOwnerPhase = 'pickup_prep';
    reasoning.push(
      'pickup and return bilaterally coordinated, handoff incomplete → pickup_prep.'
    );
  } else if (pendingProposal || !allConfirmed) {
    resolvedOwnerPhase = 'pickup_coordination';
    reasoning.push(
      pendingProposal
        ? 'pending meetup proposal → pickup_coordination.'
        : 'bilateral agreement incomplete → pickup_coordination.'
    );
  } else if (st === 'pending') {
    resolvedOwnerPhase = 'request_pending';
    reasoning.push('status=pending → request_pending.');
  } else if (agreementStatus === 'confirmed' || allConfirmed) {
    resolvedOwnerPhase = 'pickup_coordination';
    reasoning.push('agreement confirmed but pickup meetup incomplete → pickup_coordination.');
  } else {
    resolvedOwnerPhase = 'approved';
    reasoning.push('default → approved (pre-coordination).');
  }

  if (st === 'active' && !input.pickupHandoffComplete) {
    reasoning.push(
      'NOTE: rentals.status=active from booking approval does NOT imply on_rent until pickup handoff.'
    );
  }

  return {
    resolvedOwnerPhase,
    resolvedLifecyclePhase,
    agreement_status: agreementStatus,
    pickupCoordinationComplete,
    pickupConfirmed,
    pickupHandoffComplete: input.pickupHandoffComplete,
    activeRentalEligible,
    returnCoordinationEligible,
    returnCoordinationComplete,
    meetupCoordinationComplete,
    resolverReasoning: reasoning,
  };
}

export function logRentalOwnerPhase(
  rentalId: string,
  resolution: OwnerWorkspacePhaseResolution,
  extra?: { viewerRole?: string; trigger?: string; rental?: OwnerWorkspacePhaseInput['rental'] }
): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;

  const schedule = extra?.rental ? resolveMeetupScheduleFromRow(extra.rental) : null;

  logScenario('lifecycle', {
    event: 'rental_owner_phase',
    tag: 'rental-owner-phase',
    rentalId,
    trigger: extra?.trigger ?? 'resolve',
    viewerRole: extra?.viewerRole ?? null,
    agreement_status: resolution.agreement_status,
    pickupCoordinationComplete: resolution.pickupCoordinationComplete,
    pickupConfirmed: resolution.pickupConfirmed,
    pickupHandoffComplete: resolution.pickupHandoffComplete,
    activeRentalEligible: resolution.activeRentalEligible,
    returnCoordinationEligible: resolution.returnCoordinationEligible,
    returnCoordinationComplete: resolution.returnCoordinationComplete,
    meetupCoordinationComplete: resolution.meetupCoordinationComplete,
    resolvedOwnerPhase: resolution.resolvedOwnerPhase,
    resolvedLifecyclePhase: resolution.resolvedLifecyclePhase,
    resolverReasoning: resolution.resolverReasoning,
    schedulePickupIso: schedule?.pickupIso ?? null,
    scheduleReturnIso: schedule?.returnIso ?? null,
  });

  logRentalStageTransitionAudit({
    rentalId,
    triggeredBy: extra?.trigger ?? 'resolve',
    transitionReason: resolution.resolverReasoning.join(' '),
    resolvedOwnerPhase: resolution.resolvedOwnerPhase,
    rental: extra?.rental ?? { agreement_status: resolution.agreement_status },
    pickupComplete: resolution.pickupCoordinationComplete,
    returnComplete: resolution.returnCoordinationComplete,
    meetupComplete: resolution.meetupCoordinationComplete,
  });
}
