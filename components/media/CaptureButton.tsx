import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { MEDIA_CAPTURE_BUTTON_RING, MEDIA_CAPTURE_BUTTON_SIZE } from '@/components/media/mediaCaptureTokens';
import { ui } from '@/constants/appUi';

type Props = {
  disabled?: boolean;
  busy?: boolean;
  onPress: () => void;
};

/** Large premium shutter — spaced from thumbnail rail by parent layout. */
export function CaptureButton({ disabled, busy, onPress }: Props) {
  const outer = MEDIA_CAPTURE_BUTTON_SIZE;
  const ring = MEDIA_CAPTURE_BUTTON_RING;
  const inner = outer - ring * 2;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel="Capture photo"
      pressOpacityFeedback={false}
      haptic
      style={({ pressed }) => [
        styles.wrap,
        {
          width: outer,
          height: outer,
          borderRadius: outer / 2,
          opacity: disabled ? 0.45 : pressed ? 0.9 : 1,
        },
      ]}
    >
      <View style={[styles.ring, { width: outer, height: outer, borderRadius: outer / 2, borderWidth: ring }]}>
        {busy ? (
          <ActivityIndicator color={ui.primaryOn} />
        ) : (
          <View
            style={[
              styles.inner,
              {
                width: inner,
                height: inner,
                borderRadius: inner / 2,
              },
            ]}
          />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    borderColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  inner: {
    backgroundColor: ui.primaryOn,
  },
});
