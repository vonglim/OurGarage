import { FEEDBACK_TOAST_FADE_MS } from '@/constants/interactionTiming';
import { shadowCard, ui } from '@/constants/appUi';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFeedbackToastStore } from '@/store/feedbackToastStore';

export function FeedbackToastHost() {
  const insets = useSafeAreaInsets();
  const message = useFeedbackToastStore((s) => s.message);
  const holdMs = useFeedbackToastStore((s) => s.holdMs);
  const hide = useFeedbackToastStore((s) => s.hide);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!message) {
      opacity.setValue(0);
      return;
    }

    let cancelled = false;
    const runOut = () => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: FEEDBACK_TOAST_FADE_MS,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && !cancelled) hide();
      });
    };

    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: FEEDBACK_TOAST_FADE_MS,
      useNativeDriver: true,
    }).start();

    const t = setTimeout(() => {
      if (!cancelled) runOut();
    }, FEEDBACK_TOAST_FADE_MS + holdMs);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [message, holdMs, hide, opacity]);

  if (!message) return null;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Animated.View
        style={[
          styles.pill,
          {
            opacity,
            marginBottom: Math.max(insets.bottom, 12) + 8,
          },
        ]}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
      >
        <Text style={styles.text}>{message}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
    zIndex: 9999,
  },
  pill: {
    maxWidth: '88%',
    paddingHorizontal: ui.spaceMd,
    paddingVertical: ui.spaceSm,
    borderRadius: ui.radiusButton,
    backgroundColor: ui.primary,
    ...shadowCard,
  },
  text: {
    fontSize: ui.fontBody,
    color: ui.primaryOn,
    fontWeight: '600',
    textAlign: 'center',
  },
});
