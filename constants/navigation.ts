import { SCREEN_TRANSITION_MS } from './interactionTiming';

/**
 * Root stack transition length (ms). Same as {@link SCREEN_TRANSITION_MS}.
 * Passed to React Navigation native stack as `animationDuration` → `transitionDuration` on iOS.
 *
 * Easing: native-stack screens use UIKit timing (spring for `simple_push` paths); a true
 * `ease-in-out` curve is not exposed from JS for these transitions — duration is the lever we have.
 */
export const STACK_TRANSITION_DURATION_MS = SCREEN_TRANSITION_MS;
