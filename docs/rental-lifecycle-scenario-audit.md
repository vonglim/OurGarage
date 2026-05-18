# Rental lifecycle scenario audit

**Companion:** `docs/rental-lifecycle-qa-matrix.md` (canonical phases)  
**Code:** `lib/rentalLifecycle/scenarioSuites.ts`, `lib/rentalLifecycle/conflictResolution.ts`  
**DEV panel:** Rental dev toolkit → Scenario audit

## Console filters (DEV)

| Prefix | Use |
|--------|-----|
| `[rental-lifecycle]` | Integrity, phase regression, operational queues |
| `[rental-realtime]` | Subscriptions, debounced refresh |
| `[rental-routing]` | Wizard step correction, notification entry |
| `[rental-notification]` | Server notify + deep link |
| `[rental-transition]` | Transition overlay resolution + seen keys |

---

## 1. Happy path lifecycle

| Step | Actor | Action | Validate |
|------|-------|--------|----------|
| Request | Renter | Submit rental request | Owner notified |
| Approve | Owner | Approve → `rentals` row | Renter notify; card appears |
| Coordinate pickup | Renter | Propose pickup | Chat proposal; wizard Screen 1 |
| Accept pickup | Owner | Accept | Realtime → transition 1.5 or return |
| Coordinate return | Renter | Return details + ack | `pickup_return_coordination_ack_at` |
| All set | Renter | See transition once | `all_set_seen` |
| Prepare / meetup | Renter | Photos, I'm here | No regression to Screen 1 |
| Active | Both | Sign / handoff | `pickupHandoffComplete`; active_rental |
| Return | Renter | Return flow | return_pending |
| Completed | Both | Return complete | History → Completed |

**Re-entry:** After each major step — kill app → reopen from card, notification, chat. Inspector `effective_wizard_step` must match.

---

## 2. Concurrent interaction

See `CONFLICT_RESOLUTION_RULES` in `lib/rentalLifecycle/conflictResolution.ts`.

| Scenario | Expected |
|----------|----------|
| Renter edit + owner accept | Server row at accept time wins; realtime refresh |
| Owner decline + renter on screen | Focus/realtime refresh; updated proposal state |
| Cancel during coordination | Banner + Continue until terminal cancel |
| Both online | Independent refresh per device; chat ordered by time |

---

## 3. Offline / reconnect

1. Renter on coordinate_pickup — disable network — submit proposal (should fail gracefully).
2. Owner accepts while renter offline — renter resumes — must land on coordinate_return or transition (not stale Screen 1).
3. Background app during `rentals` UPDATE — foreground — debounced refresh within ~120ms.

---

## 4. Deep link integrity

| Notification type | Renter route | Notes |
|-------------------|--------------|-------|
| rental_cancellation_requested | Resolved wizard step + banner | Not generic Details |
| rental_cancellation_accepted | `/rental-wizard/{id}/s/cancelled` | |
| rental_cancellation_declined | Resolved wizard step | |
| offer_accepted / rental_confirmed | Wizard entry index → resolve | |
| Meetup accepted | Resolved step (not hardcoded URL) | |

Log: `[rental-routing] notification_navigate`

---

## 5. Transition replay prevention

| Transition | Seen key | Must |
|------------|----------|------|
| pickup_confirmed | `pickup_confirmed_seen` | Show once, then coordinate_return |
| all_set | `all_set_seen` | Show once, then prepare_pickup |
| enjoy_rental | `enjoy_rental_seen` | Once before active |

**Fail if:** Re-open wizard loops on transition forever.  
**Fail if:** Skip all_set before return ack.

Log: `[rental-transition]`

---

## 6. Wizard persistence

At each phase in happy path:

- [ ] Kill app → reopen wizard
- [ ] Open from activity Continue
- [ ] Open from notification (if applicable)
- [ ] Open from chat link

Record `LifecycleInspectorSnapshot` JSON — `effective_wizard_step` must be identical across entry points (± transition overlay).

---

## 7. Abuse / stress

- [ ] 5+ rapid proposals — no crash; last server state wins
- [ ] Cancel request → decline → request — coherent status
- [ ] Two devices same renter account — duplicate subscription warn in console only
- [ ] Navigate away from wizard and back — `activeCount` for subscriptions should return to 1

---

## 8. Operational audit

- [ ] Cancelled: not in active list; in Cancelled history (muted)
- [ ] Completed: not in active list; in Completed history
- [ ] Active rental cannot show coordinate_pickup in wizard without handoff reset

---

## 9. Sign-off criteria (before pickup-day work)

- [ ] Happy path suite: all manual steps pass
- [ ] Zero `[rental-lifecycle] … error` during happy path
- [ ] Card/wizard mismatch only on transition screens (documented warn)
- [ ] All notification types open correct screen
- [ ] Transitions do not replay
- [ ] Cancelled/completed immutability verified

## Out of scope until sign-off

Pickup-day evidence, signatures, disputes, insurance, payments.
