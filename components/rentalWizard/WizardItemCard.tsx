import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ui } from '@/constants/appUi';

export type WizardItemCardProps = {
  title: string;
  ownerLine: string;
  rentalCode: string;
  thumbUri?: string | null;
  /** Nested inside a parent summary card — no outer border/shadow. */
  embedded?: boolean;
};

export function WizardItemCard({
  title,
  ownerLine,
  rentalCode,
  thumbUri,
  embedded = false,
}: WizardItemCardProps) {
  return (
    <View style={[styles.card, embedded && styles.cardEmbedded]}>
      {thumbUri ? (
        <Image source={{ uri: thumbUri }} style={styles.thumb} contentFit="cover" />
      ) : (
        <View style={styles.thumbPh}>
          <Ionicons name="cube-outline" size={20} color={ui.textSecondary} />
        </View>
      )}
      <View style={styles.textCol}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.owner} numberOfLines={1}>
          {ownerLine}
        </Text>
        <Text style={styles.code} numberOfLines={1}>
          {rentalCode}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: ui.radiusCard,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.08)',
  },
  cardEmbedded: {
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
  },
  thumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: '#E2E8F0' },
  thumbPh: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: ui.surfaceInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 16, fontWeight: '700', color: ui.textPrimary, letterSpacing: -0.2 },
  owner: { fontSize: 13, fontWeight: '500', color: ui.textSecondary },
  code: { fontSize: 11, fontWeight: '500', color: '#94A3B8', letterSpacing: 0.2 },
});
