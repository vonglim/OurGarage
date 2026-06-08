import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { authPremium } from '@/components/rentalWizard/authorization/authPremiumTheme';
import { ui } from '@/constants/appUi';

export function AuthUpNextPreview({ label, body }: { label: string; body: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>Up next</Text>
      <View style={styles.row}>
        <View style={styles.icon}>
          <Ionicons name="arrow-forward-circle" size={22} color={authPremium.ink.accent} />
        </View>
        <View style={styles.text}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.body}>{body}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    padding: 16,
    borderRadius: authPremium.radius.card,
    backgroundColor: authPremium.surface.elevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    color: authPremium.ink.accent,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: ui.surfaceTintPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 4 },
  label: { fontSize: 16, fontWeight: '800', color: ui.textPrimary },
  body: { fontSize: 14, fontWeight: '500', color: ui.textSecondary, lineHeight: 20 },
});
