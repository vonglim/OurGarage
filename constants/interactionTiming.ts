/**
 * Shared interaction timing across the app.
 *
 * - **Press:** instant dim via opacity snap — no tween (`lib/pressFeedback.ts`).
 * - **Transitions:** stack navigation, image cross-fades, and screen entrance use the same band (150–200ms).
 * - **Feedback toasts:** short opacity fade + hold time for copy (300–500ms readable).
 */
export const SCREEN_TRANSITION_MS = 175;

/** Vertical offset for screen content entrance (px); settles to 0 with fade. */
export const SCREEN_ENTRANCE_TRANSLATE_Y = 10;

/** expo-image `transition` when the source changes (ms). */
export const IMAGE_TRANSITION_MS = SCREEN_TRANSITION_MS;

/** Toast opacity fade in / out (ms). */
export const FEEDBACK_TOAST_FADE_MS = 150;

/** Toast copy stays up after fade-in, before fade-out (ms). */
export const FEEDBACK_TOAST_HOLD_MS = 400;

/** List / preview card press — scale target (timing curve, not spring). */
export const CARD_PRESS_SCALE = 0.97;

/** Card scale press animation duration (ms) — 100–150 band. */
export const CARD_PRESS_ANIM_MS = 120;
