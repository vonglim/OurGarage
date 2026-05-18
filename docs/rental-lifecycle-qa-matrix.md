# Rental lifecycle QA matrix

**Source of truth (code):** `lib/rentalLifecycle/canonicalPhases.ts` (`CANONICAL_LIFECYCLE_MAP`)

**Resolvers (must stay aligned):**

| Resolver | File | Uses canonical |
|----------|------|----------------|
| Wizard logical step | `lib/rentalWizard/rentalWizardStepResolver.ts` | Gates + cancellation priority |
| Wizard transition | `lib/rentalWizard/rentalWizardTransitionResolver.ts` | Seen keys + gates |
| Activity card badge | `lib/rentalLifecycle/resolveActivityPresentation.ts` | `estimateCanonicalPhaseFromRentalRow` |
| Activity CTA | `estimateActivityCtaFromRentalRow` (same module) | Same estimate |
| Notification route | `lib/rentalNavigation.ts` | Cancellation-specific deep links |
| DEV inspector | `buildLifecycleInspectorSnapshot` | Full reasoning |

## Resolver priority (highest first)

1. `cancelled` — `status=cancelled` OR `cancellation_status=cancelled`
2. `cancellation_requested` — banner + continue; wizard not blocked
3. `completed` / `returned` — review / history
4. `return_pending` — return wizard branch
5. `active_rental` — requires `pickupHandoffComplete` + meetup coordination complete
6. Pickup handoff branch — prepare / meetup / sign
7. Coordination — coordinate_pickup → transitions → coordinate_return → all_set
8. `approved` / request_pending

## Phase checklist (manual QA)

| Phase | Entry | Exit | Block if | Notify | Actions |
|-------|-------|------|----------|--------|---------|
| request_pending | rental_request row | owner approves | — | rental_request | approve/decline |
| approved | rental created | pickup proposed | last_proposed_by pending | confirmed | propose, message |
| coordinate_pickup | !pickup complete | agreed pickup+location | missing agreed_* / meetup_location | proposal | propose, cancel request |
| pickup_confirmed_transition | pickup complete, !seen | pickup_confirmed_seen | seen keys | — | continue |
| coordinate_return | pickup complete, !meetup complete | ack + return schedule | ack_at, return schedule | proposal | propose return |
| all_set_transition | meetup complete, !seen | all_set_seen | seen keys | — | continue |
| prepare_pickup | coordination done | photos + im here | photos, im_here | — | approve photos |
| meetup_day | prep done | im here | — | — | im here |
| pickup_confirmed | on site | signed / bilateral ack | signed_at | — | sign |
| active_rental | handoff complete | return_pending | handoff false | — | enjoy rental |
| return_pending | status return_pending | return ack | — | — | return flow |
| review_pending | returned | review (future) | — | — | leave review |
| completed | returned/completed | terminal | — | — | history |
| cancellation_requested | cancel requested | accept/decline | — | rental_cancellation_requested | accept/decline/message |
| cancelled | terminal cancel | — | all wizard | rental_cancellation_accepted | summary only |

## Integrity tests (DEV console)

Run with wizard open; toolkit shows inspector. `assertRentalLifecycleIntegrity` warns on:

- cancelled + active status
- coordinate_return while pickup incomplete
- active_rental without handoff
- handoff without agreed_pickup_datetime
- completed without return handoff
- card phase mismatch (warn — transitions lack wizard_state on cards)

## Realtime sync audit

| Event | Table | Renter wizard refresh |
|-------|-------|------------------------|
| Owner accepts pickup proposal | rentals | rentals UPDATE subscription |
| Return proposal | rentals | rentals UPDATE |
| Cancellation request | rentals | rentals UPDATE |
| Cancellation accept/decline | rentals | rentals UPDATE |
| Transition seen | rental_wizard_state | rental_wizard_state UPDATE |

File: `app/rental-wizard/[rentalId]/_layout.tsx`

## History audit

| State | Active queue | History section |
|-------|--------------|-----------------|
| cancelled | hidden | Rental history → Cancelled (muted) |
| completed/returned | hidden | Rental history → Completed |
| in-progress | Your rentals | — |

## Wizard re-entry audit

For each phase: kill app → reopen `/rental-wizard/{id}` → must land on same effective step (not coordinate_pickup unless actually incomplete).

Document failures in GitHub issues with `LifecycleInspectorSnapshot` JSON from DEV toolkit.

## Notification matrix (code)

See `lib/rentalLifecycle/lifecycleNotificationMatrix.ts`.

## Out of scope (until stable)

- Payments / deposits
- Insurance
- Disputes
- Late fees
