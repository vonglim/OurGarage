/**
 * Canonical rental lifecycle segment for the Rental Details navigator and sections.
 * Prefer {@link deriveRentalWorkspaceLifecyclePhase} — booking approval may set status=active early.
 */
export type RentalLifecyclePhase = 'pickup' | 'active' | 'return' | 'completed';

/**
 * Workspace lifecycle segment — requires pickup handoff before `active`.
 * Booking approval sets `rentals.status = active`; that is not equipment-out.
 */
export function deriveRentalWorkspaceLifecyclePhase(input: {
  status: string | null | undefined;
  pickupHandoffComplete: boolean;
}): RentalLifecyclePhase {
  const s = String(input.status ?? 'pending').trim().toLowerCase();
  if (s === 'returned' || s === 'completed' || s === 'cancelled') return 'completed';
  if (s === 'return_pending') return 'return';
  if (s === 'handed_off') {
    return input.pickupHandoffComplete ? 'active' : 'pickup';
  }
  if (s === 'active') {
    return input.pickupHandoffComplete ? 'active' : 'pickup';
  }
  return 'pickup';
}

/**
 * Legacy status-only segment — prefer {@link deriveRentalWorkspaceLifecyclePhase} for workspace UI.
 * Bare `rentals.status = active` (booking approval) is NOT equipment-out.
 */
export function deriveLifecyclePhaseFromRentalStatus(
  status: string | null | undefined,
  options?: { pickupHandoffComplete?: boolean }
): RentalLifecyclePhase {
  return deriveRentalWorkspaceLifecyclePhase({
    status,
    pickupHandoffComplete: options?.pickupHandoffComplete ?? false,
  });
}

/** Physical handoff complete — canonical resolver only; never infer from `handed_off` / `active` alone. */
export function isRentalPickupHandoffCompleteForWorkspace(input: {
  rentalStatus: string;
  pickupHandoffComplete: boolean;
}): boolean {
  if (input.pickupHandoffComplete) return true;
  const st = String(input.rentalStatus ?? '').trim().toLowerCase();
  return ['return_pending', 'returned', 'completed', 'cancelled'].includes(st);
}

export function isReturnWorkflowEnabledForWorkspace(input: {
  rentalStatus: string;
  pickupHandoffComplete: boolean;
}): boolean {
  return isRentalPickupHandoffCompleteForWorkspace(input);
}

/**
 * UX workspace segment for Rental Details (orchestration only).
 * Maps existing `lifecyclePhase` + agreement progress — does not replace DB lifecycle.
 */
export type RentalWorkspaceStage =
  | 'agreement'
  | 'pickup_prep'
  | 'pickup_authorization'
  | 'active'
  | 'return'
  | 'completed';

export function deriveRentalWorkspaceStage(input: {
  lifecyclePhase: RentalLifecyclePhase;
  termsCompleted: boolean;
  /** Bilateral pickup + return agreed — not global `agreement_status` alone. */
  meetupCoordinationComplete: boolean;
  physicalPossessionConfirmed?: boolean;
  rentalActivated?: boolean;
}): RentalWorkspaceStage {
  if (input.lifecyclePhase === 'completed') return 'completed';
  if (input.lifecyclePhase === 'return') return 'return';
  if (input.lifecyclePhase === 'active' || input.rentalActivated) return 'active';
  if (
    input.physicalPossessionConfirmed &&
    !input.rentalActivated &&
    input.meetupCoordinationComplete
  ) {
    return 'pickup_authorization';
  }
  if (input.termsCompleted && input.meetupCoordinationComplete) return 'pickup_prep';
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
