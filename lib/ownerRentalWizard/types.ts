import type { RentalWizardContext, RentalWizardStep } from '@/lib/rentalWizard/types';

/** Owner-facing wizard steps — aligned to renter lifecycle gates, owner-specific presentation. */
export type OwnerRentalWizardStep =
  | 'cancelled'
  | 'transition_rental_confirmed'
  | 'coordinate_pickup'
  | 'transition_pickup_confirmed'
  | 'coordinate_return'
  | 'transition_return_confirmed'
  | 'transition_all_set'
  | 'owner_prepare_pickup'
  | 'transition_pickup_ready'
  | 'owner_meetup_handoff'
  | 'owner_authorization_observe'
  | 'transition_rental_active'
  | 'owner_active_rental'
  | 'transition_return_reminder'
  | 'owner_prepare_return'
  | 'owner_return_handoff'
  | 'transition_return_complete'
  | 'leave_review';

export type OwnerRentalWizardContext = RentalWizardContext & {
  viewerRole: 'owner';
};

export type OwnerRentalWizardDestination = {
  step: OwnerRentalWizardStep;
  ctaLabel: string;
  path: string;
};

/** Maps renter logical steps to owner steps for deep links / debugging. */
export const RENTER_STEP_TO_OWNER_HINT: Partial<Record<RentalWizardStep, OwnerRentalWizardStep>> = {
  coordinate_pickup: 'coordinate_pickup',
  coordinate_return: 'coordinate_return',
  prepare_pickup: 'owner_prepare_pickup',
  meetup_day: 'owner_meetup_handoff',
  owner_confirmed_arrival: 'owner_meetup_handoff',
  rental_agreement: 'owner_authorization_observe',
  security_hold_authorization: 'owner_authorization_observe',
  digital_signature: 'owner_authorization_observe',
  rental_activation: 'owner_authorization_observe',
  active_rental: 'owner_active_rental',
  prepare_return: 'owner_prepare_return',
  return_handoff: 'owner_return_handoff',
  leave_review: 'leave_review',
};
