import { CARD_PRESS_ANIM_MS, CARD_PRESS_SCALE } from '@/constants/interactionTiming';
import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable as RNPressable,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

export type CardPressableProps = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle> | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);
  children?: React.ReactNode;
};

/**
 * Pressable row/card with a subtle scale-down on press (native driver timing, no spring).
 */
export const CardPressable = forwardRef<React.ComponentRef<typeof RNPressable>, CardPressableProps>(
  function CardPressable(
    { style, onPressIn, onPressOut, disabled, children, accessibilityRole, ...rest },
    ref
  ) {
    const scale = useRef(new Animated.Value(1)).current;
    const [pressed, setPressed] = useState(false);

    const runScale = useCallback(
      (to: number) => {
        Animated.timing(scale, {
          toValue: to,
          duration: CARD_PRESS_ANIM_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      },
      [scale]
    );

    useEffect(() => {
      if (disabled) {
        setPressed(false);
        scale.setValue(1);
      }
    }, [disabled, scale]);

    const resolveCardStyle = useCallback((): StyleProp<ViewStyle> => {
      const state: PressableStateCallbackType = { pressed, hovered: false };
      return typeof style === 'function' ? style(state) : style ?? {};
    }, [style, pressed]);

    return (
      <RNPressable
        ref={ref}
        disabled={disabled}
        accessibilityRole={accessibilityRole ?? 'button'}
        {...rest}
        onPressIn={(e) => {
          onPressIn?.(e);
          if (!disabled) {
            setPressed(true);
            runScale(CARD_PRESS_SCALE);
          }
        }}
        onPressOut={(e) => {
          onPressOut?.(e);
          setPressed(false);
          runScale(1);
        }}
      >
        <Animated.View style={[resolveCardStyle(), { transform: [{ scale }] }]}>
          {children}
        </Animated.View>
      </RNPressable>
    );
  }
);

CardPressable.displayName = 'CardPressable';
