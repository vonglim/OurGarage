import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ui } from '@/constants/appUi';

function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function SecurityHoldPremiumCard({
  holdAmount,
  authorized,
}: {
  holdAmount: number;
  authorized: boolean;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.shieldWrap}>
        <View style={styles.shieldGlow} />
        <View style={styles.shieldCircle}>
          <Ionicons name="shield-checkmark" size={36} color="#FFFFFF" />
        </View>
      </View>

      <Text style={styles.title}>Temporary authorization hold</Text>
      <Text style={styles.amount}>{formatUsd(holdAmount)}</Text>
      <Text style={styles.subtitle}>This is not an immediate charge.</Text>

      <View style={styles.facts}>
        <FactRow
          icon="card-outline"
          title="Payment method"
          body="Your saved payment method on file"
        />
        <FactRow
          icon="time-outline"
          title="When it releases"
          body="Typically after return is confirmed with no outstanding claims"
        />
        <FactRow
          icon="alert-circle-outline"
          title="When it may be captured"
          body="Damage, loss, cleaning, late fees, or non-return per your agreement"
        />
      </View>

      {authorized ? (
        <View style={styles.authorizedPill}>
          <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
          <Text style={styles.authorizedText}>Hold authorized</Text>
        </View>
      ) : null}
    </View>
  );
}

function FactRow({
  icon,
  title,
  body,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.factRow}>
      <View style={styles.factIcon}>
        <Ionicons name={icon} size={18} color={ui.primary} />
      </View>
      <View style={styles.factText}>
        <Text style={styles.factTitle}>{title}</Text>
        <Text style={styles.factBody}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 4,
  },
  shieldWrap: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  shieldGlow: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(11, 31, 58, 0.12)',
  },
  shieldCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: ui.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: ui.textPrimary,
    textAlign: 'center',
  },
  amount: {
    fontSize: 32,
    fontWeight: '800',
    color: ui.primary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.textSecondary,
    marginBottom: 8,
  },
  facts: { alignSelf: 'stretch', gap: 12, marginTop: 8 },
  factRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  factIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: ui.surfaceTintPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  factText: { flex: 1, gap: 2 },
  factTitle: { fontSize: 14, fontWeight: '700', color: ui.textPrimary },
  factBody: { fontSize: 13, fontWeight: '500', color: ui.textSecondary, lineHeight: 18 },
  authorizedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#ECFDF5',
  },
  authorizedText: { fontSize: 14, fontWeight: '700', color: '#16A34A' },
});
