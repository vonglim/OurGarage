import { DEV_TOOLS_ENABLED } from '@/lib/devTools/gates';
import { getEffectiveNowMs } from '@/lib/rentalSimulation/simulationClock';
import type { RentalCancellationFields } from '@/lib/rentalCancellation/types';
import { normalizeCancellationStatus } from '@/lib/rentalCancellation/rentalCancellationState';

const MS_24H = 24 * 60 * 60 * 1000;

export type RentalCancellationGateInput = RentalCancellationFields;

export type CancellationEligibility =
  | { allowed: true }
  | {
      allowed: false;
      message: string;
      contactSupport?: boolean;
      reportIssue?: boolean;
    };

/** Terminal: rental is no longer active in lifecycle queues. */
export function isRentalCancelled(row: RentalCancellationGateInput): boolean {
  const st = String(row.status ?? '').trim().toLowerCase();
  if (st === 'cancelled' || st === 'canceled') return true;
  return normalizeCancellationStatus(row.cancellation_status) === 'cancelled';
}

export function isCancellationRequested(row: RentalCancellationGateInput): boolean {
  return normalizeCancellationStatus(row.cancellation_status) === 'requested';
}

export function isCancellationDeclined(row: RentalCancellationGateInput): boolean {
  return normalizeCancellationStatus(row.cancellation_status) === 'declined';
}

/** Active rental list — excludes cancelled and natural completion. */
export function isRentalActiveForQueues(row: RentalCancellationGateInput): boolean {
  if (isRentalCancelled(row)) return false;
  const st = String(row.status ?? '').trim().toLowerCase();
  return !['returned', 'completed'].includes(st);
}

export function isRentalCompletedHistory(row: RentalCancellationGateInput): boolean {
  if (isRentalCancelled(row)) return false;
  const st = String(row.status ?? '').trim().toLowerCase();
  return st === 'returned' || st === 'completed';
}

export function isRentalCancelledHistory(row: RentalCancellationGateInput): boolean {
  return isRentalCancelled(row);
}

export function isRentalHistoryRow(row: RentalCancellationGateInput): boolean {
  return !isRentalActiveForQueues(row);
}

export function isPickupHandoffCompleteOnRental(row: RentalCancellationGateInput): boolean {
  const st = String(row.status ?? '').trim().toLowerCase();
  if (['handed_off', 'active', 'return_pending', 'returned'].includes(st)) return true;
  if (row.handoff_approved_by_owner && row.handoff_approved_by_renter) return true;
  if (row.owner_confirmed && row.renter_confirmed && row.signed_at) return true;
  return Boolean(row.signed_at && String(row.signed_at).trim());
}

function resolvePickupMs(row: RentalCancellationGateInput): number | null {
  for (const v of [row.agreed_pickup_datetime, row.pickup_datetime, row.meetup_time]) {
    if (typeof v !== 'string' || !v.trim()) continue;
    const t = Date.parse(v.trim());
    if (Number.isFinite(t)) return t;
  }
  return null;
}

function viewerIsOwner(row: RentalCancellationGateInput, viewerUserId: string): boolean {
  return String(row.owner_user_id ?? '').trim() === viewerUserId.trim();
}

function viewerIsRenter(row: RentalCancellationGateInput, viewerUserId: string): boolean {
  return String(row.renter_user_id ?? '').trim() === viewerUserId.trim();
}

/**
 * Central eligibility for requesting cancellation.
 * Future: refunds, insurance, late penalties, auto-approve, disputes plug in here.
 */
export function evaluateCancellationRequestEligibility(
  row: RentalCancellationGateInput,
  options?: { viewerUserId?: string; nowMs?: number }
): CancellationEligibility {
  const nowMs = options?.nowMs ?? getEffectiveNowMs();
  const viewerUserId = options?.viewerUserId?.trim() ?? '';

  if (isRentalCancelled(row)) {
    return { allowed: false, message: 'This rental is already cancelled.' };
  }

  if (isCancellationRequested(row)) {
    return { allowed: false, message: 'A cancellation request is already pending.' };
  }

  if (!DEV_TOOLS_ENABLED && isPickupHandoffCompleteOnRental(row)) {
    if (viewerUserId && viewerIsOwner(row, viewerUserId)) {
      return {
        allowed: false,
        message: 'Use Report Issue for active rental problems.',
        reportIssue: true,
      };
    }
    if (viewerUserId && viewerIsRenter(row, viewerUserId)) {
      return {
        allowed: false,
        message:
          'Your rental is in progress. Use Report Issue or contact support if you need help.',
        reportIssue: true,
        contactSupport: true,
      };
    }
    return {
      allowed: false,
      message: 'Pickup handoff is complete. Use Report Issue or contact support.',
      reportIssue: true,
      contactSupport: true,
    };
  }

  if (DEV_TOOLS_ENABLED) {
    return { allowed: true };
  }

  const pickupMs = resolvePickupMs(row);
  if (pickupMs == null) {
    return { allowed: true };
  }

  if (pickupMs - nowMs < MS_24H) {
    return {
      allowed: false,
      contactSupport: true,
      message:
        'Cancellations within 24 hours of pickup need support for now. Refund policy coming soon.',
    };
  }

  return { allowed: true };
}

/** Wizard / operational flows stop only when fully cancelled — not while requested. */
export function shouldBlockWizardProgression(row: RentalCancellationGateInput): boolean {
  return isRentalCancelled(row);
}

export function shouldHideContinueCta(row: RentalCancellationGateInput): boolean {
  return isRentalCancelled(row);
}

export function cancellationRequestedByOther(
  row: RentalCancellationGateInput,
  viewerUserId: string
): boolean {
  if (!isCancellationRequested(row)) return false;
  const requester = String(row.cancellation_requested_by ?? '').trim();
  const me = viewerUserId.trim();
  return Boolean(requester && me && requester !== me);
}

export function cancellationRequestedByViewer(
  row: RentalCancellationGateInput,
  viewerUserId: string
): boolean {
  if (!isCancellationRequested(row)) return false;
  return String(row.cancellation_requested_by ?? '').trim() === viewerUserId.trim();
}

export function cancellationRequesterRole(
  row: RentalCancellationGateInput,
  ownerUserId: string,
  renterUserId: string
): 'owner' | 'renter' | null {
  const requester = String(row.cancellation_requested_by ?? '').trim();
  if (!requester) return null;
  if (requester === ownerUserId) return 'owner';
  if (requester === renterUserId) return 'renter';
  return null;
}
