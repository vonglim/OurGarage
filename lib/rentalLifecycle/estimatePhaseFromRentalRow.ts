import {
  isCancellationRequested,
  isRentalCancelled,
} from '@/lib/rentalCancellation/rentalCancellationGates';
import type { CanonicalRentalPhase } from '@/lib/rentalLifecycle/canonicalPhases';
import type { RentalCancellationFields } from '@/lib/rentalCancellation/types';

/** Lightweight rental row fields for activity cards (no wizard_state). */
export type RentalRowLifecycleEstimateInput = RentalCancellationFields & {
  agreement_status?: string | null;
  last_proposed_by?: string | null;
  agreed_return_datetime?: string | null;
  meetup_location?: string | null;
  owner_confirmed?: boolean | null;
  renter_confirmed?: boolean | null;
  signed_at?: string | null;
};

/**
 * Estimates canonical phase from `rentals` columns only.
 * Transition screens and seen_transition_keys are NOT available — may differ from wizard by 1 step.
 */
export function estimateCanonicalPhaseFromRentalRow(
  row: RentalRowLifecycleEstimateInput
): CanonicalRentalPhase {
  if (isRentalCancelled(row)) return 'cancelled';
  if (isCancellationRequested(row)) return 'cancellation_requested';

  const st = String(row.status ?? 'pending').trim().toLowerCase();
  if (st === 'returned' || st === 'completed') return 'completed';
  if (st === 'return_pending') return 'return_pending';

  const agreementStatus = String(row.agreement_status ?? '').trim().toLowerCase();
  const pendingProposal =
    agreementStatus === 'pending' && String(row.last_proposed_by ?? '').trim().length > 0;
  const allConfirmed = row.owner_confirmed === true && row.renter_confirmed === true;
  const hasPickup = Boolean(row.agreed_pickup_datetime?.trim());
  const hasLocation = Boolean(row.meetup_location?.trim());
  const hasReturn = Boolean(
    row.agreed_return_datetime?.trim() || (row as { return_datetime?: string }).return_datetime?.trim()
  );
  const signed = Boolean(row.signed_at?.trim());

  if (st === 'handed_off' || (st === 'active' && signed)) return 'active_rental';
  if (signed) return 'pickup_confirmed';

  if (hasPickup && hasLocation && hasReturn && allConfirmed && !pendingProposal) {
    return 'prepare_pickup';
  }
  if (hasPickup && hasLocation && allConfirmed && !pendingProposal) {
    return 'coordinate_return';
  }
  if (pendingProposal || !allConfirmed) {
    return hasPickup && hasLocation ? 'coordinate_return' : 'coordinate_pickup';
  }
  if (st === 'pending' || st === 'approved') {
    return hasPickup && hasLocation ? 'coordinate_return' : 'coordinate_pickup';
  }

  return 'approved';
}
