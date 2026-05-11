import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ui } from '@/constants/appUi';

export type UserNamePillProps = {
  name: string;
};

/**
 * Compact “person + name” pill used in offer detail header.
 * (UI-only; no navigation/logic side effects.)
 */
export function UserNamePill({ name }: UserNamePillProps) {
  return (
    <View style={styles.pill} accessibilityRole="text" accessibilityLabel={name}>
      <Ionicons name="person-outline" size={16} color={ui.primary} style={styles.icon} />
      <Text style={styles.text} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: ui.surfaceTintPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(11,31,58,0.12)',
    maxWidth: 200,
  },
  icon: {
    marginTop: 0,
  },
  text: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.primary,
    flexShrink: 1,
  },
});

