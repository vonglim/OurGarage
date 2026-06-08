import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ui } from '@/constants/appUi';
import { wizardLayout } from '@/constants/wizardLayout';
import type { buildEquipmentDisplay } from '@/lib/rentalAuthorization/authorizationJourney';

type EquipmentDisplay = ReturnType<typeof buildEquipmentDisplay>;

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={17} color={ui.primary} style={styles.detailIcon} />
      <View style={styles.detailText}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

export function EquipmentIdentityCard({
  display,
  thumbUri,
  rentalCode,
}: {
  display: EquipmentDisplay;
  thumbUri: string | null;
  rentalCode: string;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.heroRow}>
        {thumbUri ? (
          <Image source={{ uri: thumbUri }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={styles.thumbPh}>
            <Ionicons name="cube-outline" size={22} color={ui.textSecondary} />
          </View>
        )}
        <View style={styles.heroText}>
          <Text style={styles.title} numberOfLines={2}>
            {display.title}
          </Text>
          {display.category ? (
            <Text style={styles.category}>{display.category}</Text>
          ) : null}
          <Text style={styles.owner}>Borrowing from {display.ownerName}</Text>
          <Text style={styles.code}>{rentalCode}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <DetailRow icon="calendar-outline" label="Rental period" value={display.dateRange} />
      <DetailRow icon="location-outline" label="Pickup" value={display.pickupLocation} />
      <DetailRow icon="return-down-back-outline" label="Return" value={display.returnLocation} />
      <DetailRow icon="layers-outline" label="Included" value={display.accessories} />
      {display.serialHint ? (
        <DetailRow icon="barcode-outline" label="Serial / model" value={display.serialHint} />
      ) : null}
    </View>
  );
}

const pad = wizardLayout.summaryCardInset;

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    backgroundColor: ui.cardBg,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 3,
  },
  heroRow: {
    flexDirection: 'row',
    gap: 12,
    padding: pad,
    paddingBottom: 12,
  },
  thumb: { width: 72, height: 72, borderRadius: 14, backgroundColor: '#E2E8F0' },
  thumbPh: {
    width: 72,
    height: 72,
    borderRadius: 14,
    backgroundColor: ui.surfaceInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { flex: 1, gap: 2 },
  title: { fontSize: 18, fontWeight: '800', color: ui.textPrimary, letterSpacing: -0.3 },
  category: { fontSize: 13, fontWeight: '600', color: ui.primary },
  owner: { fontSize: 14, fontWeight: '500', color: ui.textSecondary },
  code: { fontSize: 11, fontWeight: '600', color: '#9CA3AF', marginTop: 2 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: ui.border,
    marginHorizontal: pad,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: pad,
    paddingVertical: 10,
  },
  detailIcon: { marginTop: 2 },
  detailText: { flex: 1, gap: 2 },
  detailLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: ui.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  detailValue: { fontSize: 15, fontWeight: '600', color: ui.textPrimary, lineHeight: 21 },
});
