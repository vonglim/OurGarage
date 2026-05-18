import type { CanonicalRentalPhase } from '@/lib/rentalLifecycle/canonicalPhases';

export type ScenarioCheckCategory =
  | 'cards'
  | 'wizard'
  | 'notifications'
  | 'chat'
  | 'realtime'
  | 'reentry'
  | 'routing'
  | 'transitions'
  | 'operational';

export type ScenarioStep = {
  id: string;
  label: string;
  canonicalPhase: CanonicalRentalPhase | 'request_pending';
  actor: 'renter' | 'owner' | 'both';
  action: string;
  validate: ScenarioCheckCategory[];
};

export type ScenarioSuite = {
  id: string;
  title: string;
  description: string;
  steps: ScenarioStep[];
};

/** Suite 1 — Happy path */
export const HAPPY_PATH_SUITE: ScenarioSuite = {
  id: 'happy_path',
  title: 'Happy path lifecycle',
  description: 'Full clean flow from request through completed.',
  steps: [
    { id: 'hp1', label: 'Request rental', canonicalPhase: 'request_pending', actor: 'renter', action: 'Submit listing rental request', validate: ['notifications', 'operational'] },
    { id: 'hp2', label: 'Owner approves', canonicalPhase: 'approved', actor: 'owner', action: 'Approve rental request → rentals row', validate: ['notifications', 'realtime', 'cards'] },
    { id: 'hp3', label: 'Coordinate pickup', canonicalPhase: 'coordinate_pickup', actor: 'renter', action: 'Propose pickup time/location', validate: ['wizard', 'chat', 'realtime', 'cards'] },
    { id: 'hp4', label: 'Owner accepts pickup', canonicalPhase: 'pickup_confirmed_transition', actor: 'owner', action: 'Accept meetup proposal', validate: ['notifications', 'realtime', 'transitions', 'wizard'] },
    { id: 'hp5', label: 'Coordinate return', canonicalPhase: 'coordinate_return', actor: 'renter', action: 'Confirm/propose return', validate: ['wizard', 'transitions', 'reentry'] },
    { id: 'hp6', label: 'All set transition', canonicalPhase: 'all_set_transition', actor: 'renter', action: 'Mark return ack + see transition', validate: ['transitions', 'wizard'] },
    { id: 'hp7', label: 'Prepare pickup', canonicalPhase: 'prepare_pickup', actor: 'renter', action: 'Approve photos / prep', validate: ['wizard', 'reentry'] },
    { id: 'hp8', label: 'Meetup day', canonicalPhase: 'meetup_day', actor: 'renter', action: "I'm here", validate: ['wizard', 'realtime'] },
    { id: 'hp9', label: 'Active rental', canonicalPhase: 'active_rental', actor: 'renter', action: 'Sign / handoff complete', validate: ['wizard', 'cards', 'operational'] },
    { id: 'hp10', label: 'Return flow', canonicalPhase: 'return_pending', actor: 'renter', action: 'Return coordination', validate: ['wizard', 'notifications'] },
    { id: 'hp11', label: 'Completed', canonicalPhase: 'completed', actor: 'renter', action: 'Return complete / review', validate: ['cards', 'operational', 'reentry'] },
  ],
};

export const CONCURRENT_SUITE: ScenarioSuite = {
  id: 'concurrent',
  title: 'Concurrent interaction',
  description: 'Two actors online; server authority and refresh behavior.',
  steps: [
    { id: 'cc1', label: 'Renter edits + owner accepts', canonicalPhase: 'coordinate_pickup', actor: 'both', action: 'Overlap proposal accept with form edit', validate: ['realtime', 'wizard', 'routing'] },
    { id: 'cc2', label: 'Owner declines on stale screen', canonicalPhase: 'coordinate_pickup', actor: 'both', action: 'Decline while renter on wizard', validate: ['realtime', 'wizard'] },
    { id: 'cc3', label: 'Cancel during coordination', canonicalPhase: 'cancellation_requested', actor: 'both', action: 'Request cancel + continue wizard', validate: ['wizard', 'notifications', 'chat', 'cards'] },
    { id: 'cc4', label: 'Both online', canonicalPhase: 'coordinate_return', actor: 'both', action: 'Chat + propose simultaneously', validate: ['realtime', 'chat'] },
  ],
};

export const OFFLINE_SUITE: ScenarioSuite = {
  id: 'offline',
  title: 'Offline / reconnect',
  description: 'Connection loss and app backgrounding.',
  steps: [
    { id: 'off1', label: 'Mid-proposal offline', canonicalPhase: 'coordinate_pickup', actor: 'renter', action: 'Kill network → propose → reconnect', validate: ['wizard', 'realtime'] },
    { id: 'off2', label: 'Background during owner action', canonicalPhase: 'coordinate_return', actor: 'renter', action: 'Background app while owner accepts', validate: ['realtime', 'routing'] },
    { id: 'off3', label: 'Reconnect canonical', canonicalPhase: 'coordinate_return', actor: 'renter', action: 'Resume → must match server phase', validate: ['wizard', 'reentry', 'routing'] },
  ],
};

export const DEEPLINK_SUITE: ScenarioSuite = {
  id: 'deeplink',
  title: 'Deep link integrity',
  description: 'Every notification type opens correct destination.',
  steps: [
    { id: 'dl1', label: 'cancellation_requested', canonicalPhase: 'cancellation_requested', actor: 'renter', action: 'Tap notification', validate: ['routing', 'wizard'] },
    { id: 'dl2', label: 'cancellation_accepted', canonicalPhase: 'cancelled', actor: 'renter', action: 'Tap notification', validate: ['routing', 'wizard'] },
    { id: 'dl3', label: 'pickup accepted', canonicalPhase: 'coordinate_return', actor: 'renter', action: 'Tap meetup notification', validate: ['routing', 'wizard', 'transitions'] },
    { id: 'dl4', label: 'From activity card', canonicalPhase: 'coordinate_pickup', actor: 'renter', action: 'Continue CTA', validate: ['routing', 'cards'] },
    { id: 'dl5', label: 'From chat', canonicalPhase: 'coordinate_pickup', actor: 'renter', action: 'Open rental from thread', validate: ['routing'] },
  ],
};

export const TRANSITION_SUITE: ScenarioSuite = {
  id: 'transitions',
  title: 'Transition replay prevention',
  description: 'One-time transitions: pickup_confirmed, all_set.',
  steps: [
    { id: 'tr1', label: 'pickup_confirmed once', canonicalPhase: 'pickup_confirmed_transition', actor: 'renter', action: 'Complete pickup → see 1.5 → continue', validate: ['transitions', 'wizard'] },
    { id: 'tr2', label: 'pickup_confirmed no replay', canonicalPhase: 'coordinate_return', actor: 'renter', action: 'Re-enter wizard', validate: ['transitions', 'reentry'] },
    { id: 'tr3', label: 'all_set once', canonicalPhase: 'all_set_transition', actor: 'renter', action: 'Complete return ack → see all set', validate: ['transitions'] },
    { id: 'tr4', label: 'all_set no skip', canonicalPhase: 'prepare_pickup', actor: 'renter', action: 'Must not skip before ack', validate: ['transitions', 'wizard'] },
  ],
};

export const PERSISTENCE_SUITE: ScenarioSuite = {
  id: 'persistence',
  title: 'Wizard persistence / re-entry',
  description: 'Kill app and reopen from all entry points.',
  steps: [
    { id: 'pe1', label: 'Kill at coordinate_pickup', canonicalPhase: 'coordinate_pickup', actor: 'renter', action: 'Force quit → reopen wizard', validate: ['reentry', 'wizard', 'routing'] },
    { id: 'pe2', label: 'Open from notification', canonicalPhase: 'coordinate_return', actor: 'renter', action: 'Tap push after kill', validate: ['reentry', 'routing'] },
    { id: 'pe3', label: 'Open from activity', canonicalPhase: 'coordinate_return', actor: 'renter', action: 'Continue from card', validate: ['reentry', 'cards', 'routing'] },
    { id: 'pe4', label: 'Same canonical step', canonicalPhase: 'prepare_pickup', actor: 'renter', action: 'Compare inspector effective step', validate: ['reentry', 'wizard'] },
  ],
};

export const ABUSE_SUITE: ScenarioSuite = {
  id: 'abuse',
  title: 'Simulated abuse / stress',
  description: 'Rapid actions and duplicate subscriptions.',
  steps: [
    { id: 'ab1', label: 'Spam proposals', canonicalPhase: 'coordinate_pickup', actor: 'renter', action: 'Rapid propose taps', validate: ['realtime', 'wizard'] },
    { id: 'ab2', label: 'Cancel cycles', canonicalPhase: 'cancellation_requested', actor: 'both', action: 'Request/decline/reset rapidly', validate: ['wizard', 'operational', 'chat'] },
    { id: 'ab3', label: 'Stale tabs', canonicalPhase: 'coordinate_pickup', actor: 'renter', action: 'Two devices same account', validate: ['realtime'] },
    { id: 'ab4', label: 'Subscription dup', canonicalPhase: 'coordinate_pickup', actor: 'renter', action: 'Navigate away/back wizard', validate: ['realtime'] },
  ],
};

export const OPERATIONAL_SUITE: ScenarioSuite = {
  id: 'operational',
  title: 'Operational queues',
  description: 'Active vs history immutability.',
  steps: [
    { id: 'op1', label: 'Cancelled → history', canonicalPhase: 'cancelled', actor: 'renter', action: 'Accept cancel', validate: ['operational', 'cards'] },
    { id: 'op2', label: 'Completed immutable', canonicalPhase: 'completed', actor: 'renter', action: 'No cancel CTA', validate: ['operational', 'cards'] },
    { id: 'op3', label: 'No phase regression', canonicalPhase: 'active_rental', actor: 'renter', action: 'Cannot return to coordinate_pickup', validate: ['operational', 'wizard'] },
  ],
};

export const ALL_SCENARIO_SUITES: ScenarioSuite[] = [
  HAPPY_PATH_SUITE,
  CONCURRENT_SUITE,
  OFFLINE_SUITE,
  DEEPLINK_SUITE,
  TRANSITION_SUITE,
  PERSISTENCE_SUITE,
  ABUSE_SUITE,
  OPERATIONAL_SUITE,
];
