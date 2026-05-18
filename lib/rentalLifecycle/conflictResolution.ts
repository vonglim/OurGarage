/**
 * Documented conflict-resolution behavior for renter + owner concurrent actions.
 * Used in scenario QA — implementation should match these rules.
 */

export type ConflictScenario = {
  id: string;
  actors: string;
  trigger: string;
  expectedBehavior: string;
  staleUiRule: string;
  dataAuthority: string;
};

export const CONFLICT_RESOLUTION_RULES: ConflictScenario[] = [
  {
    id: 'renter_edit_owner_accept',
    actors: 'Renter proposes pickup edit; owner accepts an older proposal',
    trigger: 'Accept uses server row at accept time; renter may have stale form draft',
    expectedBehavior:
      'Server wins on accept. Renter realtime refresh updates rentals row; wizard redirects via resolveRentalWizardDestination. Local coordinate_pickup_draft cleared when meeting complete.',
    staleUiRule:
      'If URL step lags, step screen useEffect replaces to canonical dest. Banner shows if cancellation pending.',
    dataAuthority: 'public.rentals + rental_wizard_state (renter user scope)',
  },
  {
    id: 'owner_decline_renter_on_screen',
    actors: 'Owner declines meetup/cancellation; renter still on coordination screen',
    trigger: 'rentals UPDATE realtime or focus refresh',
    expectedBehavior:
      'Renter sees updated agreement_status / last_proposed_by on refresh. No silent rollback to Screen 1 unless pickup coordination incomplete.',
    staleUiRule: 'useFocusEffect refresh on wizard layout; proposal sheet should close on error toast.',
    dataAuthority: 'public.rentals',
  },
  {
    id: 'cancellation_during_coordination',
    actors: 'Either party requests cancel during coordinate_pickup/return',
    trigger: 'cancellation_status → requested',
    expectedBehavior:
      'Wizard continues at current logical step. Cancellation banner visible. Continue CTA remains until status=cancelled. Counterparty can accept/decline.',
    staleUiRule: 'Cancelled only when status=cancelled OR cancellation_status=cancelled (resolver priority 0).',
    dataAuthority: 'cancellation_* columns on rentals',
  },
  {
    id: 'both_online_simultaneous',
    actors: 'Both users message + propose concurrently',
    trigger: 'Multiple offer_messages INSERT; rentals UPDATE',
    expectedBehavior:
      'Chat orders by created_at. Last write wins on rentals operational fields. Each client refreshes own wizard context independently.',
    staleUiRule: 'No optimistic wizard step override without server seen_transition_keys.',
    dataAuthority: 'Per-user rental_wizard_state for transitions',
  },
  {
    id: 'accept_cancel_same_window',
    actors: 'Cancellation accept while other party submits proposal',
    trigger: 'Race on rentals UPDATE',
    expectedBehavior:
      'Cancellation accept sets terminal cancelled; subsequent proposal should fail or no-op in UI. Validator warns cancelled+active.',
    staleUiRule: 'purgeTransientRentalStateOnCancellationAccepted clears drafts.',
    dataAuthority: 'cancelled terminal state',
  },
  {
    id: 'offline_reconnect',
    actors: 'Renter offline during owner accept',
    trigger: 'App resume / focus / realtime catch-up',
    expectedBehavior:
      'refresh() rebuilds context; router.replace to resolveRentalWizardDestination. No manual reload required.',
    staleUiRule: 'Stale URL step corrected on mount (step.tsx guard).',
    dataAuthority: 'Full rebuild via buildRentalWizardContext',
  },
  {
    id: 'transition_seen_per_user',
    actors: 'Renter sees transition; owner N/A on wizard',
    trigger: 'seen_transition_keys on rental_wizard_state (renter user_id only)',
    expectedBehavior:
      'pickup_confirmed_seen / all_set_seen stored per renter. Transitions never replay once key in set. advanceAfterTransition marks seen before navigate.',
    staleUiRule: 'DEV step override can bypass — not used in production.',
    dataAuthority: 'rental_wizard_state.seen_transition_keys',
  },
  {
    id: 'phase_regression_block',
    actors: 'DEV or bad data attempts active_rental without handoff',
    trigger: 'Invalid status/handoff combination',
    expectedBehavior:
      'assertRentalLifecycleIntegrity warns in DEV. Resolver requires pickupHandoffComplete for active_rental.',
    staleUiRule: 'Completed/cancelled rentals cannot appear in active queues (isRentalActiveForQueues).',
    dataAuthority: 'lib/rentalLifecycle gates + operationalIntegrity',
  },
];
