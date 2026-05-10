/**
 * Canonical rental lifecycle segment for the Rental Details navigator and sections.
 * Derived from `rentals.status` — single source of truth (not verification row acks alone).
 */
export type RentalLifecyclePhase = 'pickup' | 'active' | 'return' | 'completed';

export function deriveLifecyclePhaseFromRentalStatus(status: string | null | undefined): RentalLifecyclePhase {
  const s = String(status ?? 'pending').trim().toLowerCase();
  if (s === 'returned' || s === 'completed' || s === 'cancelled') return 'completed';
  if (s === 'return_pending') return 'return';
  if (s === 'handed_off' || s === 'active') return 'active';
  return 'pickup';
}
