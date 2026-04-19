import type { StyleProp, ViewStyle } from 'react-native';

import { ui } from '@/constants/appUi';

/**
 * Immediate press feedback: opacity applies on the same frame as `pressed` (no animation).
 * Subtle dim while pressed — append last in Pressable `style` arrays so it wins over other opacity.
 * Transitions / toasts: `@/constants/interactionTiming`.
 */
export function pressedVisual(pressed: boolean): StyleProp<ViewStyle> {
  return pressed ? { opacity: ui.pressOpacity } : {};
}
