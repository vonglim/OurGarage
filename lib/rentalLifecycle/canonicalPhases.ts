import type { RentalWizardStep } from '@/lib/rentalWizard/types';

/**
 * Authoritative rental lifecycle phases for QA, resolvers, and DEV tooling.
 * Wizard `RentalWizardStep` values map 1:1 (or via transitions) into these phases.
 */
export type CanonicalRentalPhase =
  | 'request_pending'
  | 'approved'
  | 'rental_confirmed_transition'
  | 'coordinate_pickup'
  | 'pickup_confirmed_transition'
  | 'coordinate_return'
  | 'all_set_transition'
  | 'prepare_pickup'
  | 'meetup_day'
  | 'pickup_confirmed'
  | 'active_rental'
  | 'return_pending'
  | 'review_pending'
  | 'completed'
  | 'cancellation_requested'
  | 'cancelled';

/** Lower number = higher resolver priority (evaluated first). */
export const RESOLVER_PRIORITY = {
  CANCELLED: 0,
  CANCELLATION_REQUESTED: 10,
  COMPLETED: 20,
  RETURN: 30,
  ACTIVE: 40,
  PICKUP_HANDOFF: 50,
  COORDINATION: 60,
  APPROVED: 70,
  REQUEST_PENDING: 80,
} as const;

export type LifecyclePhaseDefinition = {
  phase: CanonicalRentalPhase;
  label: string;
  resolverPriority: number;
  wizardSteps: RentalWizardStep[];
  entryConditions: string[];
  exitConditions: string[];
  blockingFields: string[];
  notificationEvents: string[];
  allowedActions: string[];
};

export const CANONICAL_LIFECYCLE_MAP: Record<CanonicalRentalPhase, LifecyclePhaseDefinition> = {
  request_pending: {
    phase: 'request_pending',
    label: 'Request pending',
    resolverPriority: RESOLVER_PRIORITY.REQUEST_PENDING,
    wizardSteps: [],
    entryConditions: ['listing rental_request status = pending', 'not yet approved into rentals row'],
    exitConditions: ['owner approves → rental row created'],
    blockingFields: [],
    notificationEvents: ['rental_request → owner'],
    allowedActions: ['owner approve', 'owner decline'],
  },
  approved: {
    phase: 'approved',
    label: 'Approved',
    resolverPriority: RESOLVER_PRIORITY.APPROVED,
    wizardSteps: ['transition_rental_confirmed', 'coordinate_pickup'],
    entryConditions: [
      'rentals row exists',
      'status pending or approved',
      'agreement may be pending confirmation',
    ],
    exitConditions: ['agreed_pickup_datetime + meetup_location set', 'or proposal flow started'],
    blockingFields: ['last_proposed_by when agreement_status=pending'],
    notificationEvents: ['rental_confirmed / offer_accepted'],
    allowedActions: ['propose pickup', 'message', 'request cancel (if eligible)'],
  },
  rental_confirmed_transition: {
    phase: 'rental_confirmed_transition',
    label: 'Rental confirmed (transition)',
    resolverPriority: RESOLVER_PRIORITY.APPROVED,
    wizardSteps: ['transition_rental_confirmed'],
    entryConditions: ['offer/request accepted', '!rental_confirmed_seen', '!isPickupCoordinationComplete'],
    exitConditions: ['markWizardTransitionSeen rental_confirmed_seen'],
    blockingFields: ['seen_transition_keys missing rental_confirmed_seen'],
    notificationEvents: ['rental_confirmed / offer_accepted'],
    allowedActions: ['continue to coordinate pickup', 'message owner', 'view rental details'],
  },
  coordinate_pickup: {
    phase: 'coordinate_pickup',
    label: 'Coordinate pickup',
    resolverPriority: RESOLVER_PRIORITY.COORDINATION,
    wizardSteps: ['coordinate_pickup'],
    entryConditions: ['!isPickupCoordinationComplete', 'not cancelled'],
    exitConditions: ['agreed_pickup_datetime + meetup_location canonical'],
    blockingFields: ['missing agreed_pickup_datetime', 'missing meetup_location'],
    notificationEvents: ['meetup proposal messages', 'rental_cancellation_requested'],
    allowedActions: ['propose pickup', 'accept/decline proposal', 'request cancel'],
  },
  pickup_confirmed_transition: {
    phase: 'pickup_confirmed_transition',
    label: 'Pickup confirmed (transition)',
    resolverPriority: RESOLVER_PRIORITY.COORDINATION,
    wizardSteps: ['transition_pickup_confirmed'],
    entryConditions: ['pickup coordination complete', '!pickup_confirmed_seen'],
    exitConditions: ['markWizardTransitionSeen pickup_confirmed_seen'],
    blockingFields: ['seen_transition_keys missing pickup_confirmed_seen'],
    notificationEvents: [],
    allowedActions: ['continue to return coordination'],
  },
  coordinate_return: {
    phase: 'coordinate_return',
    label: 'Coordinate return',
    resolverPriority: RESOLVER_PRIORITY.COORDINATION,
    wizardSteps: ['coordinate_return'],
    entryConditions: ['pickup coordination complete', '!isMeetupCoordinationComplete'],
    exitConditions: [
      'return schedule saved',
      'pickup_return_coordination_ack_at set',
      'pickup_confirmed_seen',
    ],
    blockingFields: ['missing return datetime/location', 'missing pickup_return_coordination_ack_at'],
    notificationEvents: ['return proposal / meetup messages'],
    allowedActions: ['propose return', 'confirm return', 'request cancel'],
  },
  all_set_transition: {
    phase: 'all_set_transition',
    label: 'All set (transition)',
    resolverPriority: RESOLVER_PRIORITY.COORDINATION,
    wizardSteps: ['transition_all_set'],
    entryConditions: ['isMeetupCoordinationComplete', '!all_set_seen'],
    exitConditions: ['markWizardTransitionSeen all_set_seen'],
    blockingFields: ['seen_transition_keys missing all_set_seen'],
    notificationEvents: [],
    allowedActions: ['continue to prepare pickup'],
  },
  prepare_pickup: {
    phase: 'prepare_pickup',
    label: 'Prepare for pickup',
    resolverPriority: RESOLVER_PRIORITY.PICKUP_HANDOFF,
    wizardSteps: ['prepare_pickup', 'transition_pickup_ready'],
    entryConditions: ['meetup coordination complete', '!pickupHandoffComplete'],
    exitConditions: ['owner photos uploaded', 'renter approves photos', "renter I'm here"],
    blockingFields: ['ownerPickupPhotoCount=0', 'renter_approved_pickup_photos_at null'],
    notificationEvents: ['pickup reminders (future)'],
    allowedActions: ['approve photos', "I'm here", 'message'],
  },
  meetup_day: {
    phase: 'meetup_day',
    label: 'Meetup day',
    resolverPriority: RESOLVER_PRIORITY.PICKUP_HANDOFF,
    wizardSteps: ['meetup_day'],
    entryConditions: ['photos approved or ack', 'pickup day operational'],
    exitConditions: ['renter_pickup_im_here_at', 'owner confirms arrival'],
    blockingFields: ['renter_pickup_im_here_at null'],
    notificationEvents: [],
    allowedActions: ["I'm here", 'message', 'report issue'],
  },
  pickup_confirmed: {
    phase: 'pickup_confirmed',
    label: 'Pickup confirmed',
    resolverPriority: RESOLVER_PRIORITY.PICKUP_HANDOFF,
    wizardSteps: ['owner_confirmed_arrival', 'equipment_confirmation'],
    entryConditions: ['renter on site', 'handoff flow started'],
    exitConditions: ['signed_at or bilateral handoff ack'],
    blockingFields: ['signed_at null', 'handoff not bilateral'],
    notificationEvents: [],
    allowedActions: ['sign agreement', 'confirm equipment', 'report issue'],
  },
  active_rental: {
    phase: 'active_rental',
    label: 'Active rental',
    resolverPriority: RESOLVER_PRIORITY.ACTIVE,
    wizardSteps: ['active_rental', 'transition_enjoy_rental', 'transition_return_reminder'],
    entryConditions: ['pickupHandoffComplete', 'isMeetupCoordinationComplete', 'status not return_pending'],
    exitConditions: ['status=return_pending or return window'],
    blockingFields: ['pickupHandoffComplete=false incorrectly shows active from status alone'],
    notificationEvents: [],
    allowedActions: ['view rental', 'message', 'report issue'],
  },
  return_pending: {
    phase: 'return_pending',
    label: 'Return pending',
    resolverPriority: RESOLVER_PRIORITY.RETURN,
    wizardSteps: ['prepare_return', 'owner_notified', 'return_handoff', 'transition_return_reminder'],
    entryConditions: ['status=return_pending'],
    exitConditions: ['returnHandoffComplete bilateral'],
    blockingFields: ['return operational state'],
    notificationEvents: [],
    allowedActions: ["I'm here return", 'message', 'report issue'],
  },
  review_pending: {
    phase: 'review_pending',
    label: 'Review pending',
    resolverPriority: RESOLVER_PRIORITY.COMPLETED,
    wizardSteps: ['leave_review', 'transition_return_complete'],
    entryConditions: ['status returned/completed OR returnHandoffComplete'],
    exitConditions: ['review submitted (future)'],
    blockingFields: [],
    notificationEvents: ['review (legacy)'],
    allowedActions: ['leave review', 'view history'],
  },
  completed: {
    phase: 'completed',
    label: 'Completed',
    resolverPriority: RESOLVER_PRIORITY.COMPLETED,
    wizardSteps: ['leave_review'],
    entryConditions: ['status returned or completed', 'not cancelled'],
    exitConditions: ['terminal'],
    blockingFields: [],
    notificationEvents: [],
    allowedActions: ['view history', 'chat read-only'],
  },
  cancellation_requested: {
    phase: 'cancellation_requested',
    label: 'Cancellation requested',
    resolverPriority: RESOLVER_PRIORITY.CANCELLATION_REQUESTED,
    wizardSteps: [],
    entryConditions: ['cancellation_status=requested', 'status not cancelled'],
    exitConditions: ['accept → cancelled', 'decline → declined/none'],
    blockingFields: ['cancellation_requested_by'],
    notificationEvents: ['rental_cancellation_requested'],
    allowedActions: ['accept cancel', 'decline cancel', 'message', 'continue wizard (still active)'],
  },
  cancelled: {
    phase: 'cancelled',
    label: 'Cancelled',
    resolverPriority: RESOLVER_PRIORITY.CANCELLED,
    wizardSteps: ['cancelled'],
    entryConditions: ['status=cancelled OR cancellation_status=cancelled'],
    exitConditions: ['terminal — overrides ALL wizard routing'],
    blockingFields: ['entire wizard progression blocked'],
    notificationEvents: ['rental_cancellation_accepted'],
    allowedActions: ['view summary', 'chat history', 'details'],
  },
};

export const WIZARD_STEP_TO_CANONICAL: Record<RentalWizardStep, CanonicalRentalPhase> = {
  cancelled: 'cancelled',
  transition_rental_confirmed: 'rental_confirmed_transition',
  coordinate_pickup: 'coordinate_pickup',
  transition_pickup_confirmed: 'pickup_confirmed_transition',
  coordinate_return: 'coordinate_return',
  transition_return_confirmed: 'coordinate_return',
  transition_all_set: 'all_set_transition',
  prepare_pickup: 'prepare_pickup',
  transition_pickup_ready: 'prepare_pickup',
  meetup_day: 'meetup_day',
  owner_confirmed_arrival: 'pickup_confirmed',
  equipment_confirmation: 'pickup_confirmed',
  rental_authorization: 'pickup_confirmed',
  transition_enjoy_rental: 'active_rental',
  active_rental: 'active_rental',
  transition_return_reminder: 'return_pending',
  prepare_return: 'return_pending',
  owner_notified: 'return_pending',
  return_handoff: 'return_pending',
  transition_return_complete: 'review_pending',
  leave_review: 'review_pending',
};

export function canonicalPhaseFromWizardStep(step: RentalWizardStep): CanonicalRentalPhase {
  return WIZARD_STEP_TO_CANONICAL[step] ?? 'approved';
}
