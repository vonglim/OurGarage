import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ui } from '@/constants/appUi';
import { formatWizardDateTime, formatWizardLocation } from '@/lib/rentalWizard/formatWizardSchedule';

export type WizardMeetupScheduleCardProps = {
  pickupLabel: string;
  pickupIso: string | null;
  returnLabel?: string;
  returnIso?: string | null;
  location?: string | null;
  locationLabel?: string;
};

export function WizardMeetupScheduleCard({
  pickupLabel,
  pickupIso,
  returnLabel = '',
  returnIso = null,
  location,
  locationLabel = 'Location',
}: WizardMeetupScheduleCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <Text style={styles.cardLabel}>{pickupLabel}</Text>
        <Text style={styles.cardValue}>{formatWizardDateTime(pickupIso)}</Text>
      </View>
      {location ? (
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>{locationLabel}</Text>
          <Text style={styles.cardValue}>{formatWizardLocation(location)}</Text>
        </View>
      ) : null}
      {returnLabel && returnIso ? (
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>{returnLabel}</Text>
          <Text style={styles.cardValue}>{formatWizardDateTime(returnIso)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    gap: 10,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  cardRow: { gap: 2 },
  cardLabel: { fontSize: 12, fontWeight: '600', color: ui.textSecondary },
  cardValue: { fontSize: 15, fontWeight: '600', color: ui.textPrimary },
});
