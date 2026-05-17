import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatWizardDateTime, formatWizardLocation } from '@/lib/rentalWizard/formatWizardSchedule';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';

export function WizardDarkMeetupCards({ ctx }: { ctx: RentalWizardContext }) {
  const pickupLoc = formatWizardLocation(ctx.rental.meetup_location, ctx.rental.return_location);
  const returnLoc = formatWizardLocation(
    ctx.rental.return_location,
    ctx.rental.meetup_location
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.row}>
          <Ionicons name="person-outline" size={16} color="#A5B4FC" />
          <Text style={styles.label}>Pickup details</Text>
        </View>
        <Text style={styles.loc}>{pickupLoc}</Text>
        <View style={styles.timeRow}>
          <Ionicons name="calendar-outline" size={14} color="rgba(199, 210, 254, 0.7)" />
          <Text style={styles.time}>{formatWizardDateTime(ctx.pickupIso)}</Text>
        </View>
      </View>
      <View style={styles.card}>
        <View style={styles.row}>
          <Ionicons name="lock-closed-outline" size={16} color="#4ADE80" />
          <Text style={styles.label}>Return details</Text>
        </View>
        <Text style={styles.loc}>{returnLoc}</Text>
        <View style={styles.timeRow}>
          <Ionicons name="calendar-outline" size={14} color="rgba(199, 210, 254, 0.7)" />
          <Text style={styles.time}>{formatWizardDateTime(ctx.returnIso)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: 10 },
  card: {
    backgroundColor: 'rgba(30, 41, 59, 0.85)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  label: { fontSize: 12, fontWeight: '700', color: 'rgba(226, 232, 240, 0.9)' },
  loc: { fontSize: 14, fontWeight: '600', color: '#F8FAFC', marginBottom: 6 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  time: { fontSize: 13, fontWeight: '500', color: 'rgba(199, 210, 254, 0.85)' },
});
