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

/**
 * UX workspace segment for Rental Details (orchestration only).
 * Maps existing `lifecyclePhase` + agreement progress — does not replace DB lifecycle.
 */
export type RentalWorkspaceStage =
  | 'agreement'
  | 'pickup_prep'
  | 'active'
  | 'return'
  | 'completed';

export function deriveRentalWorkspaceStage(input: {
  lifecyclePhase: RentalLifecyclePhase;
  termsCompleted: boolean;
  meetingCompleted: boolean;
}): RentalWorkspaceStage {
  if (input.lifecyclePhase === 'completed') return 'completed';
  if (input.lifecyclePhase === 'return') return 'return';
  if (input.lifecyclePhase === 'active') return 'active';
  if (input.termsCompleted && input.meetingCompleted) return 'pickup_prep';
  return 'agreement';
}

/** Short human-facing rental reference for headers (not a DB id). */
export function formatRentalWorkspaceDisplayCode(rentalId: string): string {
  const t = rentalId.trim();
  if (t.length < 4) return 'Rental';
  const compact = t.replace(/-/g, '');
  const slice = compact.length >= 6 ? compact.slice(-6) : compact;
  return `RNT-${slice.toUpperCase()}`;
}
