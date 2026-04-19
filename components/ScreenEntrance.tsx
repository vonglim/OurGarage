import { SCREEN_ENTRANCE_TRANSLATE_Y, SCREEN_TRANSITION_MS } from '@/constants/interactionTiming';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Subtle mount animation: opacity 0→1 and translateY (see {@link SCREEN_ENTRANCE_TRANSLATE_Y})→0.
 * Duration matches {@link SCREEN_TRANSITION_MS}. Does not delay `onPress` — children stay mounted.
 */
export function ScreenEntrance({ children, style }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(SCREEN_ENTRANCE_TRANSLATE_Y)).current;

  useEffect(() => {
    const easing = Easing.out(Easing.cubic);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: SCREEN_TRANSITION_MS,
        easing,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: SCREEN_TRANSITION_MS,
        easing,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY]);

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}
