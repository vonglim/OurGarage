import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';

export type PlaceholderImageProps = {
  width: number;
  height: number;
  rounded?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
};

/**
 * Fixed-size listing image placeholder — preserves layout when uploads are missing.
 */
export function PlaceholderImage({
  width,
  height,
  rounded = 12,
  onPress,
  accessibilityLabel = 'No listing image available',
}: PlaceholderImageProps) {
  const body = (
    <View style={[styles.box, { width, height, borderRadius: rounded }]}>
      <Ionicons name="image-outline" size={28} color={ui.textSecondary} />
      <Text style={styles.caption}>No image</Text>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        haptic
        pressOpacityFeedback
        style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
      >
        {body}
      </Pressable>
    );
  }

  return (
    <View accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: ui.surfaceInput,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  caption: {
    fontSize: 11,
    fontWeight: '600',
    color: ui.textSecondary,
  },
});
