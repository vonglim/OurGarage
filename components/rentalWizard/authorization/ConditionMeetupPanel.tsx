import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';
import type { PickupEvidencePhoto } from '@/lib/pickupEvidenceDisplay';

const IN_PERSON_CHECKS = [
  { id: 'operational', label: 'Operational status', icon: 'power-outline' as const },
  { id: 'cosmetic', label: 'Cosmetic wear only', icon: 'color-palette-outline' as const },
  { id: 'accessories', label: 'Accessories included', icon: 'cube-outline' as const },
  { id: 'fuel', label: 'Fuel / battery level', icon: 'battery-half-outline' as const },
  { id: 'damage', label: 'Pre-existing marks documented', icon: 'document-text-outline' as const },
];

export function ConditionMeetupPanel({
  photos,
  checked,
  onCheckedChange,
  onOpenReview,
}: {
  photos: PickupEvidencePhoto[];
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  onOpenReview?: () => void;
}) {
  const preview = photos.slice(0, 4);

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Ionicons name="search-outline" size={20} color={ui.primary} />
        <Text style={styles.panelTitle}>Pickup inspection summary</Text>
      </View>
      <Text style={styles.panelBody}>
        Compare the item in person with the owner&apos;s photos and notes before you acknowledge
        condition.
      </Text>

      {preview.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
          {preview.map((p) => (
            <Image
              key={p.id}
              source={{ uri: p.signedUrl }}
              style={styles.photoThumb}
              contentFit="cover"
            />
          ))}
        </ScrollView>
      ) : (
        <View style={styles.photoEmpty}>
          <Text style={styles.photoEmptyText}>Owner photos will appear here when uploaded.</Text>
        </View>
      )}

      {onOpenReview ? (
        <Pressable pressOpacityFeedback={false} onPress={onOpenReview} style={styles.reviewLink}>
          <Text style={styles.reviewLinkText}>Open full evidence review</Text>
          <Ionicons name="chevron-forward" size={16} color={ui.primary} />
        </Pressable>
      ) : null}

      <View style={styles.checkGrid}>
        {IN_PERSON_CHECKS.map((c) => (
          <View key={c.id} style={styles.checkChip}>
            <Ionicons name={c.icon} size={16} color="#64748B" />
            <Text style={styles.checkChipText}>{c.label}</Text>
          </View>
        ))}
      </View>

      <Pressable
        pressOpacityFeedback={false}
        onPress={() => onCheckedChange(!checked)}
        style={[styles.ackRow, checked && styles.ackRowDone]}
      >
        <Ionicons
          name={checked ? 'checkbox' : 'square-outline'}
          size={24}
          color={checked ? '#16A34A' : ui.textSecondary}
        />
        <Text style={styles.ackLabel}>
          I confirm the equipment condition matches the provided photos and inspection notes.
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  panelHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  panelTitle: { fontSize: 16, fontWeight: '800', color: ui.textPrimary },
  panelBody: { fontSize: 14, color: ui.textSecondary, lineHeight: 20 },
  photoScroll: { marginHorizontal: -4 },
  photoThumb: {
    width: 88,
    height: 88,
    borderRadius: 12,
    marginHorizontal: 4,
    backgroundColor: '#E2E8F0',
  },
  photoEmpty: {
    padding: 20,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
  },
  photoEmptyText: { fontSize: 13, color: ui.textSecondary, textAlign: 'center' },
  reviewLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  reviewLinkText: { fontSize: 14, fontWeight: '700', color: ui.primary },
  checkGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  checkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
  },
  checkChipText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  ackRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: ui.border,
  },
  ackRowDone: {
    backgroundColor: '#ECFDF5',
    borderColor: 'rgba(34, 197, 94, 0.35)',
  },
  ackLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: ui.textPrimary, lineHeight: 20 },
});
