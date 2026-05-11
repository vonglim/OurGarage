import React, { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ui } from '@/constants/appUi';

export type DetailSectionProps = {
  /** e.g. REQUEST SUMMARY */
  kicker: string;
  children: ReactNode;
};

export function DetailSection({ kicker, children }: DetailSectionProps) {
  return (
    <View style={styles.block}>
      <Text style={styles.kicker}>{kicker}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginBottom: 20,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.75,
    textTransform: 'uppercase',
    color: ui.textSecondary,
    marginBottom: 10,
  },
  card: {
    backgroundColor: ui.background,
    borderRadius: ui.radiusCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    overflow: 'hidden',
    ...{
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 10,
      elevation: 2,
    },
  },
});
