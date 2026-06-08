import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ui } from '@/constants/appUi';

export function ProtectedRentalBadge() {
  return (
    <View style={styles.badge}>
      <View style={styles.iconWrap}>
        <Ionicons name="shield-checkmark" size={18} color={ui.primary} />
      </View>
      <View style={styles.textCol}>
        <Text style={styles.title}>Protected rental</Text>
        <Text style={styles.body}>
          Agreement, disclosures, and authorization are recorded for your protection.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: ui.surfaceTintPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: ui.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '800', color: ui.primary, letterSpacing: -0.2 },
  body: { fontSize: 13, fontWeight: '500', color: ui.textSecondary, lineHeight: 18 },
});
