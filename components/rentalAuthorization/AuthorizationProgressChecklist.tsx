import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { AuthorizationProgress } from '@/lib/rentalAuthorization/authorizationProgress';
import { ui } from '@/constants/appUi';

const ROWS: { key: keyof AuthorizationProgress; label: string }[] = [
  { key: 'pickupInspectionComplete', label: 'Pickup inspection completed' },
  { key: 'equipmentConditionAcknowledged', label: 'Equipment condition acknowledged' },
  { key: 'rentalAgreementReviewed', label: 'Rental agreement reviewed' },
  { key: 'liabilityDisclosuresAccepted', label: 'Liability & late fee disclosure accepted' },
  { key: 'securityHoldAuthorized', label: 'Security hold authorized' },
  { key: 'digitalSignatureComplete', label: 'Digital signature completed' },
];

export function AuthorizationProgressChecklist({ progress }: { progress: AuthorizationProgress }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Authorization checklist</Text>
      <Text style={styles.subtitle}>
        Before the rental officially begins, complete each step below. Agreement and disclosures can
        be reviewed before meetup day.
      </Text>
      <View style={styles.rows}>
        {ROWS.map(({ key, label }) => {
          const done = Boolean(progress[key]);
          return (
            <View key={key} style={styles.row}>
              <Text style={[styles.mark, done && styles.markDone]}>{done ? '✓' : '○'}</Text>
              <Text style={[styles.label, done && styles.labelDone]}>{label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  title: { fontSize: 17, fontWeight: '700', color: ui.textPrimary },
  subtitle: { fontSize: 14, color: ui.textSecondary, lineHeight: 20 },
  rows: { marginTop: 4, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { width: 18, fontSize: 15, fontWeight: '700', color: ui.textSecondary },
  markDone: { color: '#16A34A' },
  label: { flex: 1, fontSize: 14, color: ui.textPrimary },
  labelDone: { color: ui.textSecondary },
});
