import type { RentalWizardStep } from '@/lib/rentalWizard/types';

export const WIZARD_STEP_SLUG: Record<RentalWizardStep, string> = {
  cancelled: 'cancelled',
  coordinate_pickup: 'coordinate-pickup',
  transition_pickup_confirmed: 'transition-pickup-confirmed',
  coordinate_return: 'coordinate-return',
  transition_all_set: 'transition-all-set',
  prepare_pickup: 'prepare-pickup',
  transition_pickup_ready: 'transition-pickup-ready',
  meetup_day: 'meetup-day',
  owner_confirmed_arrival: 'owner-confirmed-arrival',
  equipment_confirmation: 'equipment-confirmation',
  transition_enjoy_rental: 'transition-enjoy-rental',
  active_rental: 'active-rental',
  transition_return_reminder: 'transition-return-reminder',
  prepare_return: 'prepare-return',
  owner_notified: 'owner-notified',
  return_handoff: 'return-handoff',
  transition_return_complete: 'transition-return-complete',
  leave_review: 'leave-review',
};

const SLUG_TO_STEP = Object.fromEntries(
  Object.entries(WIZARD_STEP_SLUG).map(([step, slug]) => [slug, step])
) as Record<string, RentalWizardStep>;

export function wizardStepFromSlug(slug: string): RentalWizardStep | null {
  const key = slug.trim().toLowerCase();
  return SLUG_TO_STEP[key] ?? null;
}

export function wizardPathForStep(rentalId: string, step: RentalWizardStep): string {
  return `/rental-wizard/${rentalId}/s/${WIZARD_STEP_SLUG[step]}`;
}

type StepMeta = {
  title: string;
  ctaLabel: string;
  continueLabel: string;
  isTransition: boolean;
};

export const WIZARD_STEP_META: Record<RentalWizardStep, StepMeta> = {
  cancelled: {
    title: 'Rental cancelled',
    ctaLabel: 'Cancelled',
    continueLabel: 'View summary',
    isTransition: false,
  },
  coordinate_pickup: {
    title: 'Coordinate pickup',
    ctaLabel: 'Coordinate pickup',
    continueLabel: 'Propose pickup',
    isTransition: false,
  },
  transition_pickup_confirmed: {
    title: 'Pickup confirmed',
    ctaLabel: 'Continue',
    continueLabel: 'Continue to return details',
    isTransition: true,
  },
  coordinate_return: {
    title: 'Coordinate return',
    ctaLabel: 'Coordinate return',
    continueLabel: 'Propose return',
    isTransition: false,
  },
  transition_all_set: {
    title: 'All set for pickup & return',
    ctaLabel: 'Continue',
    continueLabel: 'Continue',
    isTransition: true,
  },
  prepare_pickup: {
    title: 'Prepare for pickup',
    ctaLabel: 'Prepare for pickup',
    continueLabel: 'Approve photos',
    isTransition: false,
  },
  transition_pickup_ready: {
    title: 'Pickup ready',
    ctaLabel: "I'm here",
    continueLabel: "I'm here",
    isTransition: true,
  },
  meetup_day: {
    title: 'Meetup day',
    ctaLabel: 'Meetup day',
    continueLabel: "I'm here",
    isTransition: false,
  },
  owner_confirmed_arrival: {
    title: 'Meetup day',
    ctaLabel: 'Equipment confirmation',
    continueLabel: 'Equipment confirmation',
    isTransition: false,
  },
  equipment_confirmation: {
    title: 'Equipment confirmation',
    ctaLabel: 'Sign & continue',
    continueLabel: 'Sign & continue',
    isTransition: false,
  },
  transition_enjoy_rental: {
    title: 'Enjoy your rental',
    ctaLabel: 'View rental',
    continueLabel: 'View rental',
    isTransition: true,
  },
  active_rental: {
    title: 'Your rental',
    ctaLabel: 'Enjoy your rental',
    continueLabel: 'Open rental',
    isTransition: false,
  },
  transition_return_reminder: {
    title: 'Return reminder',
    ctaLabel: 'Prepare for return',
    continueLabel: 'Prepare for return',
    isTransition: true,
  },
  prepare_return: {
    title: 'Prepare for return',
    ctaLabel: 'Prepare for return',
    continueLabel: "I'm here",
    isTransition: false,
  },
  owner_notified: {
    title: 'Return meetup',
    ctaLabel: 'Return meetup',
    continueLabel: 'Message owner',
    isTransition: false,
  },
  return_handoff: {
    title: 'Return handoff',
    ctaLabel: 'Return handoff',
    continueLabel: 'View progress',
    isTransition: false,
  },
  transition_return_complete: {
    title: 'Return complete',
    ctaLabel: 'Leave review',
    continueLabel: 'Leave review',
    isTransition: true,
  },
  leave_review: {
    title: 'Leave a review',
    ctaLabel: 'Leave review',
    continueLabel: 'Submit review',
    isTransition: false,
  },
};
