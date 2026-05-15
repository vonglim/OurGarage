import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ui, shadowCard } from '@/constants/appUi';
import type { RentalWorkspaceUxPhase } from '@/lib/rentalWorkspaceUxPhase';

export type RentalWorkspaceHeroProps = {
  thumbUri: string | null;
  title: string;
  rentalCodeLabel: string;
  relationshipLine: string;
  uxPhase: RentalWorkspaceUxPhase;
  chipLabel: string;
  dateRangeLine: string;
};

function badgePalette(phase: RentalWorkspaceUxPhase) {
  switch (phase) {
    case 'PICKUP_READY':
      return { bg: '#ECFDF5', border: 'rgba(22, 163, 74, 0.22)', fg: '#166534' };
    case 'ACTIVE':
      return { bg: '#EFF6FF', border: 'rgba(11, 31, 58, 0.14)', fg: ui.primary };
    case 'RETURN_PENDING':
      return { bg: '#F0F9FF', border: 'rgba(2, 132, 199, 0.2)', fg: '#0369A1' };
    case 'COMPLETED':
      return { bg: '#F0FDF4', border: 'rgba(22, 163, 74, 0.25)', fg: '#166534' };
    case 'CANCELLED':
    case 'DECLINED':
      return { bg: '#FEF2F2', border: 'rgba(220, 38, 38, 0.2)', fg: '#B91C1C' };
    case 'REQUEST_PENDING':
      return { bg: '#FFFBEB', border: 'rgba(217, 119, 6, 0.25)', fg: '#B45309' };
    case 'APPROVED':
    default:
      return { bg: '#EFF6FF', border: 'rgba(37, 99, 235, 0.2)', fg: ui.primary };
  }
}

export function RentalWorkspaceHero({
  thumbUri,
  title,
  rentalCodeLabel,
  relationshipLine,
  uxPhase,
  chipLabel,
  dateRangeLine,
}: RentalWorkspaceHeroProps) {
  const chip = badgePalette(uxPhase);
  const displayTitle = title.trim() || 'Rental item';

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        {thumbUri ? (
          <Image source={{ uri: thumbUri }} style={styles.thumb} contentFit="cover" accessibilityIgnoresInvertColors />
        ) : (
          <View style={styles.thumbPh} accessibilityElementsHidden>
            <Ionicons name="cube-outline" size={20} color={ui.textSecondary} />
          </View>
        )}
        <View style={styles.textCol}>
          <Text style={styles.title} numberOfLines={2}>
            {displayTitle}
          </Text>
          <Text style={styles.dates} numberOfLines={1}>
            {dateRangeLine}
          </Text>
          <View style={styles.chipRow}>
            <View style={[styles.badge, { backgroundColor: chip.bg, borderColor: chip.border }]}>
              <Text style={[styles.badgeText, { color: chip.fg }]} numberOfLines={1}>
                {chipLabel}
              </Text>
            </View>
          </View>
          <Text style={styles.relationship} numberOfLines={1}>
            {relationshipLine}
          </Text>
          <Text style={styles.code} numberOfLines={1}>
            {rentalCodeLabel}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: ui.radiusCard,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    ...shadowCard,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  thumb: { width: 52, height: 52, borderRadius: 12, backgroundColor: ui.surfaceInput },
  thumbPh: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: ui.surfaceInput,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  textCol: { flex: 1, minWidth: 0, gap: 2 },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: ui.textPrimary,
    letterSpacing: -0.3,
    lineHeight: 21,
  },
  dates: { fontSize: 12, fontWeight: '700', color: ui.textPrimary, marginTop: 1 },
  chipRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  badge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.15, textAlign: 'center' },
  relationship: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: ui.textSecondary,
    letterSpacing: -0.1,
  },
  code: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(100, 116, 139, 0.9)',
    letterSpacing: 0.15,
  },
});
