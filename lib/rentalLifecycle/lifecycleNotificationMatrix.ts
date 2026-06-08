/**
 * Notification audit matrix — lifecycle transition → server type → recipient → route → copy intent.
 * Keep in sync with lib/rentalCancellation/rentalCancellationActions.ts and lib/rentalMeetupProposalLifecycle.ts.
 *
 * Primary rental journey entry: guided wizard (`/rental-wizard` or `/owner-rental-wizard`) via
 * `pushRentalJourneyEntry` / `openGuidedRentalFlow`. Legacy `/rental/[id]` is manual/secondary only.
 */

export type LifecycleNotificationSpec = {
  lifecycleTransition: string;
  serverType: string;
  recipient: 'owner' | 'renter' | 'counterparty' | 'requester';
  route: string;
  copyIntent: string;
};

export const LIFECYCLE_NOTIFICATION_MATRIX: LifecycleNotificationSpec[] = [
  {
    lifecycleTransition: 'rental approved',
    serverType: 'rental_confirmed / offer_accepted',
    recipient: 'renter',
    route: '/rental-wizard/{id} | /owner-rental-wizard/{id} (role-resolved)',
    copyIntent: 'Booking confirmed — coordinate pickup',
  },
  {
    lifecycleTransition: 'pickup proposal sent',
    serverType: 'pickup_proposal_received → message',
    recipient: 'counterparty',
    route: '/rental-wizard/{id} | /owner-rental-wizard/{id} (role-resolved)',
    copyIntent: 'Review pickup proposal in wizard',
  },
  {
    lifecycleTransition: 'return proposal sent',
    serverType: 'return_proposal_received → message',
    recipient: 'counterparty',
    route: '/rental-wizard/{id} | /owner-rental-wizard/{id} (role-resolved)',
    copyIntent: 'Review return proposal in wizard',
  },
  {
    lifecycleTransition: 'pickup proposal accepted',
    serverType: 'pickup_confirmed / message / rental lifecycle',
    recipient: 'counterparty',
    route: '/rental-wizard/{id} | /owner-rental-wizard/{id} resolved step',
    copyIntent: 'Pickup confirmed — continue wizard',
  },
  {
    lifecycleTransition: 'cancellation requested',
    serverType: 'rental_cancellation_requested',
    recipient: 'counterparty',
    route: '/rental-wizard/{id} | /owner-rental-wizard/{id} resolved step + banner',
    copyIntent: 'Asked to cancel — rental stays active until response',
  },
  {
    lifecycleTransition: 'cancellation accepted',
    serverType: 'rental_cancellation_accepted',
    recipient: 'counterparty',
    route: '/rental-wizard/{id}/s/cancelled | /owner-rental-wizard/{id}/s/cancelled',
    copyIntent: 'Cancellation accepted',
  },
  {
    lifecycleTransition: 'cancellation declined',
    serverType: 'rental_cancellation_declined',
    recipient: 'requester',
    route: '/rental-wizard/{id} | /owner-rental-wizard/{id} current step',
    copyIntent: 'Cancellation declined — continue coordinating',
  },
  {
    lifecycleTransition: 'listing rental declined',
    serverType: 'rental_declined',
    recipient: 'renter',
    route: '/activity-renting?section=rentals or listing-detail',
    copyIntent: 'Request declined',
  },
];
