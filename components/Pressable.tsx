import React, { forwardRef } from 'react';
import {
  Pressable as RNPressable,
  type GestureResponderEvent,
  type PressableProps,
  type PressableStateCallbackType,
} from 'react-native';

import { lightImpact } from '@/lib/haptics';
import { pressedVisual } from '@/lib/pressFeedback';

type Props = PressableProps & {
  /**
   * When false, skips the default whole-control opacity dim so solid buttons can use
   * `primarySolidPressed` / custom backgrounds without muddying label contrast.
   */
  pressOpacityFeedback?: boolean;
  /** Light impact on press in — use sparingly for primary / important actions. */
  haptic?: boolean;
};

/**
 * Same API as RN `Pressable`, with optional default press dim ({@link pressedVisual}) merged after your styles.
 */
export const Pressable = forwardRef<React.ComponentRef<typeof RNPressable>, Props>(
  function Pressable(
    { style, pressOpacityFeedback = true, haptic, onPressIn, ...rest },
    ref
  ) {
    const handlePressIn =
      haptic || onPressIn
        ? (e: GestureResponderEvent) => {
            if (haptic) lightImpact();
            onPressIn?.(e);
          }
        : undefined;

    return (
      <RNPressable
        ref={ref}
        {...rest}
        onPressIn={handlePressIn}
        style={(state: PressableStateCallbackType) => {
          const resolved = typeof style === 'function' ? style(state) : style;
          return [resolved, pressOpacityFeedback ? pressedVisual(state.pressed) : undefined];
        }}
      />
    );
  }
);

Pressable.displayName = 'Pressable';
