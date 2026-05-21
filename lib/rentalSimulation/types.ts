import type { RentalLifecyclePhase } from '@/lib/rentalLifecyclePhase';
import type { RentalWizardProgress, RentalWizardStep, RentalWizardTransitionKey } from '@/lib/rentalWizard/types';

/** Dev-only lifecycle snapshot for one-tap jumps (UI + optional DB simulation). */
export type RentalSimulationJump =
  | 'request_pending'
  | 'rental_confirmed'
  | 'pickup_coordination'
  | 'pickup_confirmed'
  | 'waiting_for_photos'
  | 'pickup_ready'
  | 'meetup_day'
  | 'active_rental'
  | 'return_reminder'
  | 'return_prep'
  | 'return_meetup'
  | 'return_complete'
  | 'review_stage';

export type RentalSimulationJumpConfig = {
  id: RentalSimulationJump;
  label: string;
  lifecycle: RentalLifecyclePhase;
  wizardStep: RentalWizardStep;
  wizardProgress?: Partial<RentalWizardProgress>;
  markTransitionsSeen?: RentalWizardTransitionKey[];
  /** Human blocker label for debug panel. */
  blockerHint?: string;
};

import type { RentalWizardContext } from '@/lib/rentalWizard/types';

export type RentalDevRegisteredContext = {
  rentalId: string;
  pathname: string;
  source: 'rental_workspace' | 'rental_wizard';
  refresh?: () => Promise<void>;
  wizardCtx?: RentalWizardContext | null;
  /** DEV: show pickup-accepted lifecycle overlay without realtime. */
  simulatePickupAcceptedOverlay?: () => void;
  /** DEV: show return-accepted lifecycle overlay without realtime. */
  simulateReturnAcceptedOverlay?: () => void;
};
