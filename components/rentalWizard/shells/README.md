# Rental wizard shells

Three canonical shell categories — use these instead of one-off layout per screen.

## 1. Form wizard (`WizardLightShell`)

**Use for:** multi-step coordination and data entry.

- Coordinate pickup / return
- Prepare pickup / return
- Equipment confirmation

**Provides:** titled header, progress slot, `GuidedWizardChrome` scroll + primary/secondary footer, wizard section tokens.

## 2. Celebration transition (`WizardCelebrationTransitionShell`)

**Use for:** one-time emotional checkpoints before the next operational step.

- Rental confirmed (.5)
- Pickup confirmed (future migration from dark shell)
- All set (future migration)

**Provides:** minimal header (back + messages), celebration hero rhythm, tiered footer stack (primary → secondary → tertiary), grouped footer chrome.

## 3. Operational action (`WizardLightShell` or dedicated meetup shells)

**Use for:** day-of actions and issue handling.

- Meetup day, return handoff
- Active rental hub actions

**Provides:** same form tokens as (1); may add status banners and action grids.

---

**Layout source of truth:** `constants/wizardLayout.ts`

**Dark legacy:** `WizardTransitionShell` — migrate remaining dark transitions to `WizardCelebrationTransitionShell` when touched.

## Realtime lifecycle prompts

`WizardLifecyclePromptOverlay` + `wizardLifecyclePromptDetection.ts` — in-context acknowledgment when another party changes coordination while the renter is on a wizard step (no auto-navigation). First event: owner accepts pickup proposal on Coordinate Pickup.
