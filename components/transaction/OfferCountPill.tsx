import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ui } from '@/constants/appUi';

export type OfferCountPillProps = {
  count: number;
};

export function OfferCountPill({ count }: OfferCountPillProps) {
  const label = count === 1 ? '1 offer' : `${count} offers`;
  return (
    <View style={styles.pill} accessibilityRole="text" accessibilityLabel={label}>
      <Ionicons name="person-outline" size={16} color={ui.primary} style={styles.icon} />
      <Text style={styles.text}>{label}</Text>
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
    maxWidth: 160,
  },
  icon: {
    marginTop: 0,
  },
  text: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.primary,
  },
});
