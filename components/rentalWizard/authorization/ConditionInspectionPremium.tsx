import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';
import { wizardLayout } from '@/constants/wizardLayout';
import { authPremium } from '@/components/rentalWizard/authorization/authPremiumTheme';
import type { PickupEvidencePhoto } from '@/lib/pickupEvidenceDisplay';

const INSPECT_CATEGORIES = [
  { id: 'operational', label: 'Runs correctly', icon: 'power' as const },
  { id: 'cosmetic', label: 'Cosmetic wear OK', icon: 'color-palette' as const },
  { id: 'accessories', label: 'Accessories', icon: 'cube' as const },
  { id: 'power', label: 'Fuel / battery', icon: 'battery-half' as const },
  { id: 'damage', label: 'Pre-existing marks', icon: 'bandage' as const },
] as const;

export function ConditionInspectionPremium({
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
  const [notesExpanded, setNotesExpanded] = useState(false);
  const heroPhoto = photos[0];

  return (
    <View style={styles.wrap}>
      {heroPhoto ? (
        <Pressable
          pressOpacityFeedback={false}
          onPress={onOpenReview}
          style={({ pressed }) => [styles.heroPhoto, pressed && { opacity: 0.95 }]}
        >
          <Image source={{ uri: heroPhoto.signedUrl }} style={styles.heroImage} contentFit="cover" />
          <LinearGradientOverlay />
          <View style={styles.heroOverlay}>
            <Text style={styles.heroLabel}>Owner inspection photos</Text>
            <Text style={styles.heroCta}>Tap to review full gallery</Text>
          </View>
        </Pressable>
      ) : (
        <View style={styles.heroEmpty}>
          <Ionicons name="images-outline" size={32} color={ui.textSecondary} />
          <Text style={styles.heroEmptyText}>Photos upload before you acknowledge</Text>
        </View>
      )}

      {photos.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbRow}>
          {photos.slice(1, 5).map((p) => (
            <Image key={p.id} source={{ uri: p.signedUrl }} style={styles.thumb} contentFit="cover" />
          ))}
        </ScrollView>
      ) : null}

      <Text style={styles.sectionTitle}>What to verify in person</Text>
      <View style={styles.chipGrid}>
        {INSPECT_CATEGORIES.map((c) => (
          <View key={c.id} style={styles.chip}>
            <Ionicons name={`${c.icon}-outline`} size={16} color={ui.primary} />
            <Text style={styles.chipText}>{c.label}</Text>
          </View>
        ))}
      </View>

      <Pressable
        pressOpacityFeedback={false}
        onPress={() => setNotesExpanded((v) => !v)}
        style={styles.notesToggle}
      >
        <Text style={styles.notesToggleText}>
          {notesExpanded ? 'Hide inspection tips' : 'What if something looks off?'}
        </Text>
        <Ionicons
          name={notesExpanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={ui.primary}
        />
      </Pressable>
      {notesExpanded ? (
        <Text style={styles.notesBody}>
          Message the owner before acknowledging. Document concerns in chat so both parties have a
          record.
        </Text>
      ) : null}

      <Pressable
        pressOpacityFeedback={false}
        haptic
        onPress={() => onCheckedChange(!checked)}
        style={[styles.ackCard, checked && styles.ackCardDone]}
      >
        <View style={styles.ackIcon}>
          <Ionicons
            name={checked ? 'checkmark-circle' : 'ellipse-outline'}
            size={28}
            color={checked ? '#16A34A' : '#94A3B8'}
          />
        </View>
        <Text style={styles.ackLabel}>
          Condition matches photos and inspection notes
        </Text>
      </Pressable>
    </View>
  );
}

function LinearGradientOverlay() {
  return (
    <LinearGradient
      colors={['transparent', 'rgba(15, 23, 42, 0.75)']}
      style={StyleSheet.absoluteFill}
    />
  );
}

const bleedOut = wizardLayout.screenPaddingHorizontal;

const styles = StyleSheet.create({
  wrap: { gap: wizardLayout.sectionContentGap, alignSelf: 'stretch' },
  heroPhoto: {
    height: 200,
    marginHorizontal: -bleedOut,
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
  },
  heroImage: { width: '100%', height: '100%' },
  heroOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    gap: 4,
  },
  heroLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  heroCta: { fontSize: 15, fontWeight: '700', color: 'rgba(255,255,255,0.95)' },
  heroEmpty: {
    height: 160,
    marginHorizontal: -bleedOut,
    borderRadius: 0,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  heroEmptyText: { fontSize: 14, color: ui.textSecondary },
  thumbRow: { marginHorizontal: -4 },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 12,
    marginHorizontal: 4,
    backgroundColor: '#E2E8F0',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: ui.textPrimary,
    letterSpacing: -0.2,
  },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: authPremium.radius.chip,
    backgroundColor: ui.surfaceTintPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  chipText: { fontSize: 13, fontWeight: '700', color: ui.primary },
  notesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  notesToggleText: { fontSize: 14, fontWeight: '700', color: ui.primary },
  notesBody: {
    fontSize: 14,
    color: ui.textSecondary,
    lineHeight: 20,
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 12,
  },
  ackCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: authPremium.radius.card,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  ackCardDone: {
    borderColor: '#86EFAC',
    backgroundColor: '#F0FDF4',
  },
  ackIcon: {},
  ackLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: ui.textPrimary,
    lineHeight: 22,
  },
});
