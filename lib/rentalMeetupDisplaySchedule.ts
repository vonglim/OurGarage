import { agreedScheduleIsoPairFromRequest } from '@/lib/agreedRentalScheduleFromRequest';
import {
  reconcileOperationalPickupIso,
  reconcileOperationalReturnIso,
  resolveProposedMeetupLocation,
  resolveProposedPickupIso,
  resolveProposedReturnIso,
} from '@/lib/rentalWizard/proposedMeetupSchedule';

export type MeetupDisplayRenderSource =
  | 'pending_operational_return'
  | 'pending_operational_pickup'
  | 'pending_operational_both'
  | 'accepted_agreed_return'
  | 'accepted_agreed_pickup'
  | 'accepted_operational_return'
  | 'accepted_operational_pickup'
  | 'request_fallback_return'
  | 'request_fallback_pickup'
  | 'none';

export type RentalMeetupRowLike = {
  agreement_status?: string | null;
  last_proposed_by?: string | null;
  agreed_pickup_datetime?: string | null;
  agreed_return_datetime?: string | null;
  meetup_time?: string | null;
  pickup_datetime?: string | null;
  return_time?: string | null;
  return_datetime?: string | null;
  meetup_location?: string | null;
  return_location?: string | null;
};

export type ResolvedMeetupDisplaySchedule = {
  pickupIso: string | null;
  returnIso: string | null;
  location: string;
  pickupSource: MeetupDisplayRenderSource;
  returnSource: MeetupDisplayRenderSource;
  acceptedPickupIso: string | null;
  acceptedReturnIso: string | null;
  pendingPickupProposalIso: string | null;
  pendingReturnProposalIso: string | null;
  hasPendingProposal: boolean;
  lastProposedBy: string | null;
};

function parseIso(raw: string | null | undefined): string | null {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s || !Number.isFinite(Date.parse(s))) return null;
  return s;
}

/** Pending meetup proposal awaiting bilateral approval. */
export function rentalHasPendingMeetupProposal(rental: RentalMeetupRowLike): boolean {
  return (
    String(rental.agreement_status ?? '').trim().toLowerCase() === 'pending' &&
    String(rental.last_proposed_by ?? '').trim().length > 0
  );
}

function resolveAcceptedPickupIso(rental: RentalMeetupRowLike): string | null {
  return parseIso(rental.agreed_pickup_datetime);
}

function resolveAcceptedReturnIso(rental: RentalMeetupRowLike): string | null {
  return parseIso(rental.agreed_return_datetime);
}

/**
 * UI meetup schedule — pending proposals always render operational columns first.
 * Accepted/confirmed rentals render `agreed_*` then operational fallbacks.
 */
export function resolveMeetupDisplaySchedule(input: {
  rental: RentalMeetupRowLike;
  requestSchedulingMeta?: unknown;
  /** Pass when already computed; otherwise derived from rental row. */
  hasPendingProposal?: boolean;
}): ResolvedMeetupDisplaySchedule {
  const hasPendingProposal =
    input.hasPendingProposal ?? rentalHasPendingMeetupProposal(input.rental);
  const lastProposedBy = String(input.rental.last_proposed_by ?? '').trim() || null;

  const acceptedPickupIso = resolveAcceptedPickupIso(input.rental);
  const acceptedReturnIso = resolveAcceptedReturnIso(input.rental);
  const pickupReconciled = reconcileOperationalPickupIso(input.rental);
  const returnReconciled = reconcileOperationalReturnIso(input.rental);
  const pendingPickupProposalIso = pickupReconciled.iso;
  const pendingReturnProposalIso = returnReconciled.iso;

  const requestPair = agreedScheduleIsoPairFromRequest(input.requestSchedulingMeta);

  let pickupIso: string | null = null;
  let returnIso: string | null = null;
  let pickupSource: MeetupDisplayRenderSource = 'none';
  let returnSource: MeetupDisplayRenderSource = 'none';

  if (hasPendingProposal) {
    pickupIso = pendingPickupProposalIso;
    returnIso = pendingReturnProposalIso;

    pickupSource = pendingPickupProposalIso
      ? 'pending_operational_pickup'
      : 'none';
    returnSource = pendingReturnProposalIso
      ? 'pending_operational_return'
      : 'none';
  } else {
    pickupIso =
      acceptedPickupIso ??
      parseIso(input.rental.pickup_datetime) ??
      parseIso(input.rental.meetup_time) ??
      requestPair.pickupIso;
    returnIso =
      acceptedReturnIso ??
      parseIso(input.rental.return_datetime) ??
      parseIso(input.rental.return_time) ??
      requestPair.returnIso;

    pickupSource = acceptedPickupIso
      ? 'accepted_agreed_pickup'
      : parseIso(input.rental.pickup_datetime) || parseIso(input.rental.meetup_time)
        ? 'accepted_operational_pickup'
        : requestPair.pickupIso
          ? 'request_fallback_pickup'
          : 'none';
    returnSource = acceptedReturnIso
      ? 'accepted_agreed_return'
      : parseIso(input.rental.return_datetime) || parseIso(input.rental.return_time)
        ? 'accepted_operational_return'
        : requestPair.returnIso
          ? 'request_fallback_return'
          : 'none';
  }

  const location = hasPendingProposal
    ? resolveProposedMeetupLocation(input.rental)
    : (input.rental.meetup_location ?? input.rental.return_location ?? '').trim();

  return {
    pickupIso,
    returnIso,
    location,
    pickupSource,
    returnSource,
    acceptedPickupIso,
    acceptedReturnIso,
    pendingPickupProposalIso,
    pendingReturnProposalIso,
    hasPendingProposal,
    lastProposedBy,
  };
}

export function logRentalMeetupRender(
  rentalId: string,
  schedule: ResolvedMeetupDisplaySchedule,
  extra?: Record<string, unknown>
): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  console.log('[rental-meetup-render]', {
    rentalId,
    acceptedReturnIso: schedule.acceptedReturnIso,
    pendingReturnProposalIso: schedule.pendingReturnProposalIso,
    renderedReturnIso: schedule.returnIso,
    renderSource: schedule.returnSource,
    acceptedPickupIso: schedule.acceptedPickupIso,
    pendingPickupProposalIso: schedule.pendingPickupProposalIso,
    renderedPickupIso: schedule.pickupIso,
    pickupRenderSource: schedule.pickupSource,
    hasPendingProposal: schedule.hasPendingProposal,
    last_proposed_by: schedule.lastProposedBy,
    location: schedule.location,
    rawMeetupTime: extra?.rawMeetupTime ?? null,
    rawPickupDatetime: extra?.rawPickupDatetime ?? null,
    rawReturnTime: extra?.rawReturnTime ?? null,
    rawReturnDatetime: extra?.rawReturnDatetime ?? null,
    pickupFieldConflict: extra?.pickupFieldConflict ?? false,
    returnFieldConflict: extra?.returnFieldConflict ?? false,
    ...extra,
  });
}

/** For accept lifecycle — operational columns with agreed fallback. */
export function resolvePendingProposalPickupIso(rental: RentalMeetupRowLike): string | null {
  return resolveProposedPickupIso(rental);
}

export function resolvePendingProposalReturnIso(rental: RentalMeetupRowLike): string | null {
  return resolveProposedReturnIso(rental);
}
