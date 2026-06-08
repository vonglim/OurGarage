import type { OwnerRentalWizardStep } from '@/lib/ownerRentalWizard/types';

export const OWNER_WIZARD_STEP_SLUG: Record<OwnerRentalWizardStep, string> = {
  cancelled: 'cancelled',
  transition_rental_confirmed: 'transition-rental-confirmed',
  coordinate_pickup: 'coordinate-pickup',
  transition_pickup_confirmed: 'transition-pickup-confirmed',
  coordinate_return: 'coordinate-return',
  transition_return_confirmed: 'transition-return-confirmed',
  transition_all_set: 'transition-all-set',
  owner_prepare_pickup: 'prepare-pickup',
  transition_pickup_ready: 'transition-pickup-ready',
  owner_meetup_handoff: 'meetup-handoff',
  owner_authorization_observe: 'authorization',
  transition_rental_active: 'transition-rental-active',
  owner_active_rental: 'active-rental',
  transition_return_reminder: 'transition-return-reminder',
  owner_prepare_return: 'prepare-return',
  owner_return_handoff: 'return-handoff',
  transition_return_complete: 'transition-return-complete',
  leave_review: 'leave-review',
};

const SLUG_TO_STEP = Object.fromEntries(
  Object.entries(OWNER_WIZARD_STEP_SLUG).map(([step, slug]) => [slug, step])
) as Record<string, OwnerRentalWizardStep>;

export function ownerWizardStepFromSlug(slug: string): OwnerRentalWizardStep | null {
  return SLUG_TO_STEP[slug.trim().toLowerCase()] ?? null;
}

export function ownerWizardPathForStep(rentalId: string, step: OwnerRentalWizardStep): string {
  return `/owner-rental-wizard/${rentalId.trim()}/s/${OWNER_WIZARD_STEP_SLUG[step]}`;
}

type StepMeta = { title: string; ctaLabel: string; continueLabel: string; isTransition: boolean };

export const OWNER_WIZARD_STEP_META: Record<OwnerRentalWizardStep, StepMeta> = {
  cancelled: { title: 'Rental cancelled', ctaLabel: 'Cancelled', continueLabel: 'View summary', isTransition: false },
  transition_rental_confirmed: {
    title: 'Booking confirmed',
    ctaLabel: 'Coordinate pickup',
    continueLabel: 'Coordinate pickup',
    isTransition: true,
  },
  coordinate_pickup: {
    title: 'Coordinate pickup',
    ctaLabel: "Review renter's pickup proposal",
    continueLabel: 'Propose pickup details',
    isTransition: false,
  },
  transition_pickup_confirmed: {
    title: 'Pickup details confirmed',
    ctaLabel: 'Coordinate return',
    continueLabel: 'Continue to return details',
    isTransition: true,
  },
  coordinate_return: {
    title: 'Coordinate return',
    ctaLabel: "Review renter's return proposal",
    continueLabel: 'Propose return details',
    isTransition: false,
  },
  transition_return_confirmed: {
    title: 'Return details confirmed',
    ctaLabel: 'Continue',
    continueLabel: 'Continue',
    isTransition: true,
  },
  transition_all_set: {
    title: 'All set for pickup & return',
    ctaLabel: 'Prepare item',
    continueLabel: 'Prepare your item',
    isTransition: true,
  },
  owner_prepare_pickup: {
    title: 'Prepare for pickup',
    ctaLabel: 'Prepare for pickup',
    continueLabel: 'Confirm item ready',
    isTransition: false,
  },
  transition_pickup_ready: {
    title: 'Pickup ready',
    ctaLabel: 'Meetup day',
    continueLabel: 'Continue',
    isTransition: true,
  },
  owner_meetup_handoff: {
    title: 'Meetup day',
    ctaLabel: 'Meetup day',
    continueLabel: "I'm here",
    isTransition: false,
  },
  owner_authorization_observe: {
    title: 'Rental authorization',
    ctaLabel: 'Rental authorization',
    continueLabel: 'Continue',
    isTransition: false,
  },
  transition_rental_active: {
    title: 'Rental active',
    ctaLabel: 'View rental',
    continueLabel: 'View active rental',
    isTransition: true,
  },
  owner_active_rental: {
    title: 'Your rental',
    ctaLabel: 'View rental',
    continueLabel: 'View rental details',
    isTransition: false,
  },
  transition_return_reminder: {
    title: 'Return reminder',
    ctaLabel: 'Prepare for return',
    continueLabel: 'Prepare for return',
    isTransition: true,
  },
  owner_prepare_return: {
    title: 'Prepare for return',
    ctaLabel: 'Prepare for return',
    continueLabel: "I'm here",
    isTransition: false,
  },
  owner_return_handoff: {
    title: 'Return handoff',
    ctaLabel: 'Return handoff',
    continueLabel: 'Complete return handoff',
    isTransition: false,
  },
  transition_return_complete: {
    title: 'Return complete',
    ctaLabel: 'Leave a review',
    continueLabel: 'Leave a review',
    isTransition: true,
  },
  leave_review: {
    title: 'Leave a review',
    ctaLabel: 'Leave a review',
    continueLabel: 'Submit review',
    isTransition: false,
  },
};
