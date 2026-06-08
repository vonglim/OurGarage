import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { authPremium } from '@/components/rentalWizard/authorization/authPremiumTheme';
import { ui } from '@/constants/appUi';
import type { AuthorizationProgress } from '@/lib/rentalAuthorization/authorizationProgress';

const ROWS: {
  key: keyof AuthorizationProgress;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: 'rentalAgreementReviewed', label: 'Agreement reviewed', icon: 'document-text-outline' },
  { key: 'liabilityDisclosuresAccepted', label: 'Disclosures complete', icon: 'reader-outline' },
  { key: 'securityHoldAuthorized', label: 'Hold authorized', icon: 'shield-checkmark-outline' },
  { key: 'pickupInspectionComplete', label: 'Pickup inspection', icon: 'camera-outline' },
  { key: 'digitalSignatureComplete', label: 'Signature complete', icon: 'create-outline' },
];

export function ActivationCheckpointList({ progress }: { progress: AuthorizationProgress }) {
  const ready = progress.activationReady;
  const doneCount = ROWS.filter((r) => Boolean(progress[r.key])).length;

  return (
    <View style={[styles.card, ready && styles.cardReady]}>
        <View style={styles.header}>
          <Text style={styles.title}>{ready ? 'Ready to activate' : 'Your progress'}</Text>
          <View style={styles.pill}>
            <Text style={styles.pillText}>
              {doneCount}/{ROWS.length}
            </Text>
          </View>
        </View>
        <Text style={styles.subtitle}>
          {ready
            ? 'Everything is in place. Activate when you are at pickup and ready to begin.'
            : 'Finish the steps below — each one takes just a minute.'}
        </Text>
        <View style={styles.rows}>
          {ROWS.map(({ key, label, icon }) => {
            const done = Boolean(progress[key]);
            return (
              <View key={key} style={styles.row}>
                <View style={[styles.iconWrap, done && styles.iconWrapDone]}>
                  <Ionicons name={icon} size={18} color={done ? '#16A34A' : ui.textSecondary} />
                </View>
                <Text style={[styles.label, done && styles.labelDone]}>{label}</Text>
                {done ? (
                  <Ionicons name="checkmark-circle" size={22} color="#16A34A" />
                ) : (
                  <View style={styles.pendingRing} />
                )}
              </View>
            );
          })}
        </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    backgroundColor: ui.cardBg,
    borderRadius: authPremium.radius.card,
    padding: 20,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  cardReady: {
    borderColor: 'rgba(34, 197, 94, 0.25)',
    backgroundColor: '#FAFFFE',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: ui.textPrimary,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: ui.textSecondary,
    lineHeight: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  pill: {
    backgroundColor: ui.surfaceTintPrimary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '700',
    color: ui.primary,
  },
  rows: { marginTop: 8, gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: ui.surfaceInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapDone: { backgroundColor: '#DCFCE7' },
  label: { flex: 1, fontSize: 15, fontWeight: '600', color: ui.textPrimary },
  labelDone: { color: ui.textSecondary },
  pendingRing: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: ui.border,
  },
});
