import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import {
  resolvePickupHandoffPresence,
  type PickupHandoffPresenceInput,
  type PickupHandoffPresenceSnapshot,
} from '@/lib/pickupHandoffPresence';

function parseTs(v: string | null | undefined): boolean {
  return Boolean(v?.trim() && Number.isFinite(Date.parse(v.trim())));
}

/** Rental columns that affect live meetup presence / handoff gates. */
export const PICKUP_HANDOFF_PRESENCE_RENTAL_FIELDS = [
  'owner_arrived_at',
  'renter_arrived_at',
  'renter_confirmed_receipt_at',
  'owner_confirmed_handoff_at',
  'possession_transferred_at',
  'pickup_handoff_completed_at',
  'owner_pickup_ready',
  'renter_pickup_ready',
  'handoff_approved_by_owner',
  'handoff_approved_by_renter',
  'handoff_approval_started_at',
  'signed_at',
  'status',
] as const;

export type PickupHandoffPresenceRentalPatch = {
  owner_arrived_at?: string | null;
  renter_arrived_at?: string | null;
  renter_confirmed_receipt_at?: string | null;
  owner_confirmed_handoff_at?: string | null;
  possession_transferred_at?: string | null;
  pickup_handoff_completed_at?: string | null;
  owner_pickup_ready?: boolean | null;
  renter_pickup_ready?: boolean | null;
  handoff_approved_by_owner?: boolean | null;
  handoff_approved_by_renter?: boolean | null;
  handoff_approval_started_at?: string | null;
  signed_at?: string | null;
  status?: string | null;
};

export type LivePresencePhase =
  | 'pre_meetup'
  | 'waiting_for_renter'
  | 'renter_arrived'
  | 'waiting_for_owner'
  | 'both_present'
  | 'handoff_ready'
  | 'complete';

export type PickupHandoffPresenceState = PickupHandoffPresenceSnapshot & {
  waitingOn: 'owner' | 'renter' | null;
  canConfirmHandoff: boolean;
  canConfirmReceipt: boolean;
  livePresencePhase: LivePresencePhase;
  ownerLivePhase:
    | 'confirm_ready'
    | 'waiting_for_renter'
    | 'renter_arrived'
    | 'both_present'
    | 'handoff_ready'
    | 'waiting_receipt'
    | 'idle';
  renterLivePhase:
    | 'prepare'
    | 'mark_arrival'
    | 'waiting_for_owner'
    | 'both_present'
    | 'sign_and_authorize'
    | 'confirm_receipt'
    | 'idle';
};

export type PickupHandoffPresenceStateInput = PickupHandoffPresenceInput & {
  handoffApprovalStarted?: boolean;
  handoffCompleted?: boolean;
  pickupAck?: { owner: boolean; renter: boolean };
  viewerRole?: 'owner' | 'renter';
  renterConfirmedReceipt?: boolean;
  ownerConfirmedHandoff?: boolean;
};

export function resolvePickupHandoffPresenceState(
  input: PickupHandoffPresenceStateInput
): PickupHandoffPresenceState {
  const base = resolvePickupHandoffPresence(input);
  const handoffStarted =
    input.handoffApprovalStarted ??
    Boolean(
      input.rental.handoff_approval_started_at?.trim() || input.rental.handoff_approved_by_owner === true
    );
  const handoffCompleted = input.handoffCompleted === true;
  const ack = input.pickupAck ?? { owner: false, renter: false };
  const renterConfirmedReceipt =
    input.renterConfirmedReceipt === true ||
    ack.renter ||
    parseTs(input.rental.renter_confirmed_receipt_at);
  const ownerConfirmedHandoff =
    input.ownerConfirmedHandoff === true ||
    ack.owner ||
    parseTs(input.rental.owner_confirmed_handoff_at);
  const presenceRoutingActive =
    !handoffCompleted &&
    !base.possessionTransferred &&
    !renterConfirmedReceipt &&
    !ownerConfirmedHandoff;

  let waitingOn: 'owner' | 'renter' | null = null;
  if (handoffStarted && presenceRoutingActive) {
    if (base.renterArrived && !base.ownerArrived) waitingOn = 'owner';
    else if (!base.renterArrived && base.ownerArrived) waitingOn = 'renter';
    else if (!base.renterArrived && !base.ownerArrived) waitingOn = 'renter';
  }

  const canConfirmHandoff =
    presenceRoutingActive && handoffStarted && base.bothPresent && !ack.owner;
  const canConfirmReceipt =
    presenceRoutingActive && handoffStarted && base.bothPresent && !ack.renter;

  let livePresencePhase: LivePresencePhase = 'pre_meetup';
  if (handoffCompleted || base.possessionTransferred || renterConfirmedReceipt) {
    livePresencePhase = 'complete';
  } else if (!presenceRoutingActive) {
    livePresencePhase = 'complete';
  } else if (canConfirmHandoff || canConfirmReceipt) livePresencePhase = 'handoff_ready';
  else if (base.bothPresent) livePresencePhase = 'both_present';
  else if (base.renterArrived && !base.ownerArrived) livePresencePhase = 'renter_arrived';
  else if (!base.renterArrived && base.ownerArrived) livePresencePhase = 'waiting_for_owner';
  else if (handoffStarted && !base.renterArrived) livePresencePhase = 'waiting_for_renter';

  let ownerLivePhase: PickupHandoffPresenceState['ownerLivePhase'] = 'idle';
  if (!handoffCompleted && presenceRoutingActive) {
    if (canConfirmHandoff) ownerLivePhase = 'handoff_ready';
    else if (base.bothPresent && !ack.owner) ownerLivePhase = 'both_present';
    else if (base.renterArrived && !base.ownerArrived) ownerLivePhase = 'renter_arrived';
    else if (handoffStarted && !base.renterArrived) ownerLivePhase = 'waiting_for_renter';
    else if (ack.owner && !ack.renter) ownerLivePhase = 'waiting_receipt';
    else if (!handoffStarted && input.ownerPickupPrepComplete) ownerLivePhase = 'confirm_ready';
  }

  let renterLivePhase: PickupHandoffPresenceState['renterLivePhase'] = 'idle';
  if (!handoffCompleted && presenceRoutingActive) {
    if (canConfirmReceipt) renterLivePhase = 'confirm_receipt';
    else if (
      base.bothPresent &&
      (renterConfirmedReceipt || ack.renter) &&
      !input.rental.handoff_approved_by_renter
    ) {
      renterLivePhase = 'sign_and_authorize';
    } else if (base.bothPresent) renterLivePhase = 'both_present';
    else if (base.renterArrived && !base.ownerArrived) renterLivePhase = 'waiting_for_owner';
    else if (handoffStarted && base.renterReady && !base.renterArrived) renterLivePhase = 'mark_arrival';
    else if (!handoffStarted) renterLivePhase = 'prepare';
  }

  return {
    ...base,
    waitingOn,
    canConfirmHandoff,
    canConfirmReceipt,
    livePresencePhase,
    ownerLivePhase,
    renterLivePhase,
  };
}

function fieldChanged(
  oldRow: Record<string, unknown> | undefined,
  newRow: Record<string, unknown> | undefined,
  key: string
): boolean {
  const o = oldRow?.[key];
  const n = newRow?.[key];
  return String(o ?? '') !== String(n ?? '');
}

export function extractPickupHandoffPresenceRentalPatch(
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>
): { patch: PickupHandoffPresenceRentalPatch; presenceChanged: boolean } | null {
  if (payload.table !== 'rentals' || payload.eventType !== 'UPDATE') return null;
  const oldRow = payload.old as Record<string, unknown> | undefined;
  const newRow = payload.new as Record<string, unknown> | undefined;
  if (!newRow) return null;

  let presenceChanged = false;
  const patch: PickupHandoffPresenceRentalPatch = {};
  const assign = <K extends keyof PickupHandoffPresenceRentalPatch>(key: K, value: unknown) => {
    if (!fieldChanged(oldRow, newRow, key)) return;
    presenceChanged = true;
    if (typeof value === 'string' || typeof value === 'boolean' || value === null) {
      patch[key] = value as PickupHandoffPresenceRentalPatch[K];
    }
  };
  assign('owner_arrived_at', newRow.owner_arrived_at);
  assign('renter_arrived_at', newRow.renter_arrived_at);
  assign('renter_confirmed_receipt_at', newRow.renter_confirmed_receipt_at);
  assign('owner_confirmed_handoff_at', newRow.owner_confirmed_handoff_at);
  assign('possession_transferred_at', newRow.possession_transferred_at);
  assign('pickup_handoff_completed_at', newRow.pickup_handoff_completed_at);
  assign('owner_pickup_ready', newRow.owner_pickup_ready);
  assign('renter_pickup_ready', newRow.renter_pickup_ready);
  assign('handoff_approved_by_owner', newRow.handoff_approved_by_owner);
  assign('handoff_approved_by_renter', newRow.handoff_approved_by_renter);
  assign('handoff_approval_started_at', newRow.handoff_approval_started_at);
  assign('signed_at', newRow.signed_at);
  assign('status', newRow.status);
  if (!presenceChanged) return null;
  return { patch, presenceChanged };
}

export type RenterWizardHandoffPatch = {
  renterPickupImHereAt?: string | null;
  renterApprovedPickupPhotosAt?: string | null;
  renterConfirmedPickupReceiptAt?: string | null;
};

export function extractRenterWizardHandoffPatch(
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>
): RenterWizardHandoffPatch | null {
  if (payload.table !== 'rental_wizard_state') return null;
  const newRow = payload.new as { wizard_progress?: Record<string, unknown> } | undefined;
  if (!newRow?.wizard_progress || typeof newRow.wizard_progress !== 'object') return null;
  const wp = newRow.wizard_progress;
  const patch: RenterWizardHandoffPatch = {};
  if (typeof wp.renter_pickup_im_here_at === 'string') {
    patch.renterPickupImHereAt = wp.renter_pickup_im_here_at;
  }
  if (typeof wp.renter_approved_pickup_photos_at === 'string') {
    patch.renterApprovedPickupPhotosAt = wp.renter_approved_pickup_photos_at;
  }
  if (typeof wp.renter_confirmed_pickup_receipt_at === 'string') {
    patch.renterConfirmedPickupReceiptAt = wp.renter_confirmed_pickup_receipt_at;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

export function logPickupHandoffLive(input: {
  rentalId: string;
  triggerSource: string;
  rerenderedSurface: string;
  ownerArrived: boolean;
  renterArrived: boolean;
  bothPresent: boolean;
  previousPresenceState: LivePresencePhase | null;
  nextPresenceState: LivePresencePhase;
  latencyMs: number;
}): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  console.log('[pickup-handoff-live]', {
    rentalId: input.rentalId,
    triggerSource: input.triggerSource,
    ownerArrived: input.ownerArrived,
    renterArrived: input.renterArrived,
    bothPresent: input.bothPresent,
    rerenderedSurface: input.rerenderedSurface,
    previousPresenceState: input.previousPresenceState,
    nextPresenceState: input.nextPresenceState,
    latencyMs: input.latencyMs,
  });
}
