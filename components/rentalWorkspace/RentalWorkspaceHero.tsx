import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ui, shadowCard } from '@/constants/appUi';
import type { RentalWorkspaceUxPhase } from '@/lib/rentalWorkspaceUxPhase';

export type RentalWorkspaceHeroProps = {
  thumbUri: string | null;
  title: string;
  displayCode: string;
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
  displayCode,
  uxPhase,
  chipLabel,
  dateRangeLine,
}: RentalWorkspaceHeroProps) {
  const chip = badgePalette(uxPhase);

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        {thumbUri ? (
          <Image source={{ uri: thumbUri }} style={styles.thumb} contentFit="cover" accessibilityIgnoresInvertColors />
        ) : (
          <View style={styles.thumbPh} accessibilityElementsHidden>
            <Ionicons name="cube-outline" size={18} color={ui.textSecondary} />
          </View>
        )}
        <View style={styles.textCol}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={2}>
              {title.trim() || 'Rental'}
            </Text>
            <View style={[styles.badge, { backgroundColor: chip.bg, borderColor: chip.border }]}>
              <Text style={[styles.badgeText, { color: chip.fg }]} numberOfLines={1}>
                {chipLabel}
              </Text>
            </View>
          </View>
          <Text style={styles.code} numberOfLines={1}>
            {displayCode}
          </Text>
          <Text style={styles.dates} numberOfLines={1}>
            {dateRangeLine}
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
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    ...shadowCard,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 44, height: 44, borderRadius: 10, backgroundColor: ui.surfaceInput },
  thumbPh: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: ui.surfaceInput,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  textCol: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: ui.textPrimary,
    letterSpacing: -0.2,
    lineHeight: 19,
  },
  badge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '38%',
  },
  badgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.15, textAlign: 'center' },
  code: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: ui.textSecondary,
    letterSpacing: 0.2,
  },
  dates: { marginTop: 2, fontSize: 12, fontWeight: '700', color: ui.textPrimary },
});
