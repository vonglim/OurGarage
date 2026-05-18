/**
 * Notification audit matrix — lifecycle transition → server type → recipient → route → copy intent.
 * Keep in sync with lib/rentalCancellation/rentalCancellationActions.ts and lib/rentalMeetupProposalLifecycle.ts.
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
    route: '/rental-wizard/{id} (renter) | /rental/[id] (owner)',
    copyIntent: 'Booking confirmed — coordinate pickup',
  },
  {
    lifecycleTransition: 'pickup proposal sent',
    serverType: 'message + meetup proposal thread',
    recipient: 'counterparty',
    route: '/chat/[offerId] or rental chat',
    copyIntent: 'Meetup proposal card in thread',
  },
  {
    lifecycleTransition: 'pickup proposal accepted',
    serverType: 'message / rental lifecycle',
    recipient: 'renter',
    route: '/rental-wizard/{id} → coordinate_return or transition',
    copyIntent: 'Pickup confirmed — continue wizard',
  },
  {
    lifecycleTransition: 'cancellation requested',
    serverType: 'rental_cancellation_requested',
    recipient: 'counterparty',
    route: '/rental-wizard/{id} resolved step + banner | /rental/[id] owner',
    copyIntent: 'Asked to cancel — rental stays active until response',
  },
  {
    lifecycleTransition: 'cancellation accepted',
    serverType: 'rental_cancellation_accepted',
    recipient: 'requester',
    route: '/rental-wizard/{id}/s/cancelled (renter)',
    copyIntent: 'Cancellation accepted',
  },
  {
    lifecycleTransition: 'cancellation declined',
    serverType: 'rental_cancellation_declined',
    recipient: 'requester',
    route: '/rental-wizard/{id} current step',
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
