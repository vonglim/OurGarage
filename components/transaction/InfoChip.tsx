import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ui } from '@/constants/appUi';

export type InfoChipProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  accessibilityLabel?: string;
};

export function InfoChip({ icon, label, accessibilityLabel }: InfoChipProps) {
  return (
    <View
      style={styles.wrap}
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Ionicons name={icon} size={14} color={ui.textSecondary} style={styles.icon} />
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: ui.surfaceGrouped,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  icon: {
    marginTop: 0,
  },
  label: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
    color: ui.textPrimary,
  },
});
