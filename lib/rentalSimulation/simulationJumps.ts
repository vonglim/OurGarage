import type { RentalSimulationJump, RentalSimulationJumpConfig } from '@/lib/rentalSimulation/types';

export const RENTAL_SIMULATION_JUMPS: RentalSimulationJumpConfig[] = [
  {
    id: 'request_pending',
    label: 'Request pending',
    lifecycle: 'pickup',
    wizardStep: 'coordinate_pickup',
    blockerHint: 'awaiting_owner_approval',
  },
  {
    id: 'rental_confirmed',
    label: 'Rental confirmed',
    lifecycle: 'pickup',
    wizardStep: 'transition_rental_confirmed',
    blockerHint: 'rental_just_accepted',
  },
  {
    id: 'pickup_coordination',
    label: 'Pickup coordination',
    lifecycle: 'pickup',
    wizardStep: 'coordinate_pickup',
    markTransitionsSeen: ['rental_confirmed_seen'],
    blockerHint: 'pickup_schedule_pending',
  },
  {
    id: 'pickup_confirmed',
    label: 'Pickup confirmed',
    lifecycle: 'pickup',
    wizardStep: 'transition_pickup_confirmed',
    blockerHint: 'pickup_schedule_confirmed',
  },
  {
    id: 'waiting_for_photos',
    label: 'Waiting for photos',
    lifecycle: 'pickup',
    wizardStep: 'prepare_pickup',
    blockerHint: 'waiting_for_owner_photos',
  },
  {
    id: 'pickup_ready',
    label: 'Pickup ready',
    lifecycle: 'pickup',
    wizardStep: 'transition_pickup_ready',
    blockerHint: 'owner_photos_uploaded',
  },
  {
    id: 'meetup_day',
    label: 'Meetup day',
    lifecycle: 'pickup',
    wizardStep: 'meetup_day',
    wizardProgress: { renter_approved_pickup_photos_at: 'dev-sim' },
    blockerHint: 'meetup_day',
  },
  {
    id: 'active_rental',
    label: 'Active rental',
    lifecycle: 'active',
    wizardStep: 'active_rental',
    markTransitionsSeen: ['pickup_confirmed_seen', 'all_set_seen', 'pickup_ready_seen', 'enjoy_rental_seen'],
    blockerHint: 'rental_active',
  },
  {
    id: 'return_reminder',
    label: 'Return reminder',
    lifecycle: 'active',
    wizardStep: 'transition_return_reminder',
    markTransitionsSeen: ['return_reminder_seen'],
    blockerHint: 'return_window_approaching',
  },
  {
    id: 'return_prep',
    label: 'Return prep',
    lifecycle: 'return',
    wizardStep: 'prepare_return',
    blockerHint: 'return_coordination',
  },
  {
    id: 'return_meetup',
    label: 'Return meetup',
    lifecycle: 'return',
    wizardStep: 'return_handoff',
    wizardProgress: { renter_return_im_here_at: 'dev-sim' },
    blockerHint: 'return_meetup',
  },
  {
    id: 'return_complete',
    label: 'Return complete',
    lifecycle: 'return',
    wizardStep: 'transition_return_complete',
    markTransitionsSeen: ['return_complete_seen'],
    blockerHint: 'return_handoff_pending',
  },
  {
    id: 'review_stage',
    label: 'Review stage',
    lifecycle: 'completed',
    wizardStep: 'leave_review',
    blockerHint: 'awaiting_review',
  },
];

const BY_ID = new Map(RENTAL_SIMULATION_JUMPS.map((j) => [j.id, j]));

export function getSimulationJumpConfig(id: RentalSimulationJump): RentalSimulationJumpConfig {
  return BY_ID.get(id) ?? RENTAL_SIMULATION_JUMPS[0]!;
}
