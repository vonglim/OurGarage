import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ui } from '@/constants/appUi';
import { buildEquipmentDisplay } from '@/lib/rentalAuthorization/authorizationJourney';
import { formatWizardDateTime } from '@/lib/rentalWizard/formatWizardSchedule';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.summaryRow}>
      <Ionicons name={icon} size={16} color={ui.primary} style={styles.summaryIcon} />
      <View style={styles.summaryText}>
        <Text style={styles.summaryLabel}>{label}</Text>
        <Text style={styles.summaryValue}>{value}</Text>
      </View>
    </View>
  );
}

export type RentalAgreementSummaryCardProps = {
  ctx: RentalWizardContext;
};

export function RentalAgreementSummaryCard({ ctx }: RentalAgreementSummaryCardProps) {
  const equipment = useMemo(() => buildEquipmentDisplay(ctx), [ctx]);

  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryTitle}>{equipment.title}</Text>
      <SummaryRow icon="location-outline" label="Pickup location" value={equipment.pickupLocation} />
      <SummaryRow
        icon="calendar-outline"
        label="Pickup date & time"
        value={formatWizardDateTime(ctx.pickupIso)}
      />
      <SummaryRow
        icon="return-down-back-outline"
        label="Return location"
        value={equipment.returnLocation}
      />
      <SummaryRow
        icon="calendar-outline"
        label="Return date & time"
        value={formatWizardDateTime(ctx.returnIso)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  summaryCard: {
    backgroundColor: ui.cardBg,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    padding: 14,
    gap: 10,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: ui.textPrimary,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    minWidth: 0,
  },
  summaryIcon: { marginTop: 2, flexShrink: 0 },
  summaryText: { flex: 1, minWidth: 0, gap: 2 },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: ui.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.textPrimary,
    lineHeight: 20,
    flexShrink: 1,
  },
});
