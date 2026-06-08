import { isPickupHandoffBilaterallyComplete } from '@/lib/rentalOperationalAttention';

export type PickupHandoffPresenceLane =
  | 'preparing'
  | 'ready'
  | 'reviewing'
  | 'approved'
  | 'arrived'
  | 'received'
  | 'handed_off';

export type PickupHandoffPresenceSnapshot = {
  ownerReady: boolean;
  renterReady: boolean;
  ownerArrived: boolean;
  renterArrived: boolean;
  bothPresent: boolean;
  handoffConfirmed: boolean;
  possessionTransferred: boolean;
  ownerLane: PickupHandoffPresenceLane;
  renterLane: PickupHandoffPresenceLane;
};

export type PickupHandoffPresenceInput = {
  rental: {
    status?: string | null;
    owner_pickup_ready?: boolean | null;
    renter_pickup_ready?: boolean | null;
    handoff_approved_by_owner?: boolean | null;
    handoff_approved_by_renter?: boolean | null;
    handoff_approval_started_at?: string | null;
    signed_at?: string | null;
    owner_arrived_at?: string | null;
    renter_arrived_at?: string | null;
    renter_confirmed_receipt_at?: string | null;
    owner_confirmed_handoff_at?: string | null;
    possession_transferred_at?: string | null;
    pickup_handoff_completed_at?: string | null;
  };
  /** Fallback when rentals.renter_arrived_at not yet backfilled. */
  renterPickupImHereAt?: string | null;
  renterApprovedPickupPhotosAt?: string | null;
  pickupAck?: { owner: boolean; renter: boolean };
  ownerPickupPrepComplete: boolean;
};

function parseTs(v: string | null | undefined): boolean {
  return Boolean(v?.trim() && Number.isFinite(Date.parse(v.trim())));
}

export function resolvePickupHandoffPresence(
  input: PickupHandoffPresenceInput
): PickupHandoffPresenceSnapshot {
  /** Owner explicitly confirmed ready — not renter preauth or prep-complete alone. */
  const ownerReady =
    input.rental.owner_pickup_ready === true || input.rental.handoff_approved_by_owner === true;

  const renterEvidenceApproved =
    parseTs(input.renterApprovedPickupPhotosAt) || input.rental.handoff_approved_by_renter === true;

  const renterReady =
    input.rental.renter_pickup_ready === true || renterEvidenceApproved;

  const ownerArrived = parseTs(input.rental.owner_arrived_at);
  const renterArrived =
    parseTs(input.rental.renter_arrived_at) || parseTs(input.renterPickupImHereAt);

  const bothPresent = ownerArrived && renterArrived;

  const handoffConfirmed =
    input.rental.handoff_approved_by_owner === true && input.rental.handoff_approved_by_renter === true;

  const possessionTransferred =
    parseTs(input.rental.signed_at) ||
    isPickupHandoffBilaterallyComplete({
      pickupAck: input.pickupAck ?? { owner: false, renter: false },
      signedAt: input.rental.signed_at,
    });

  let ownerLane: PickupHandoffPresenceLane = 'preparing';
  if (possessionTransferred) ownerLane = 'handed_off';
  else if (bothPresent && handoffConfirmed) ownerLane = 'handed_off';
  else if (ownerArrived) ownerLane = 'arrived';
  else if (ownerReady) ownerLane = 'ready';
  else if (input.ownerPickupPrepComplete) ownerLane = 'ready';

  let renterLane: PickupHandoffPresenceLane = 'reviewing';
  if (possessionTransferred) renterLane = 'received';
  else if (bothPresent && handoffConfirmed) renterLane = 'received';
  else if (renterArrived) renterLane = 'arrived';
  else if (renterEvidenceApproved) renterLane = 'approved';
  else if (renterReady) renterLane = 'approved';

  return {
    ownerReady,
    renterReady,
    ownerArrived,
    renterArrived,
    bothPresent,
    handoffConfirmed,
    possessionTransferred,
    ownerLane,
    renterLane,
  };
}

export function logPickupHandoffPresence(
  rentalId: string,
  input: {
    presence: PickupHandoffPresenceSnapshot;
    triggeredBy: string;
    workspaceStage?: string | null;
    lifecyclePhase?: string | null;
    viewerRole?: string | null;
  }
): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  const p = input.presence;
  console.log('[pickup-handoff-presence]', {
    rentalId,
    triggeredBy: input.triggeredBy,
    workspaceStage: input.workspaceStage ?? null,
    lifecyclePhase: input.lifecyclePhase ?? null,
    viewerRole: input.viewerRole ?? null,
    ownerReady: p.ownerReady,
    renterReady: p.renterReady,
    ownerArrived: p.ownerArrived,
    renterArrived: p.renterArrived,
    bothPresent: p.bothPresent,
    handoffConfirmed: p.handoffConfirmed,
    possessionTransferred: p.possessionTransferred,
    ownerLane: p.ownerLane,
    renterLane: p.renterLane,
  });
}
