import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';

export type PremiumDisclosureCardProps = {
  icon: keyof typeof Ionicons.glyphMap;
  iconTint?: string;
  title: string;
  summary: string;
  bullets?: string[];
  fullDetails?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  checkboxLabel: string;
  requiresInitials?: boolean;
  initials?: string;
  onInitialsChange?: (v: string) => void;
  completed?: boolean;
};

export function PremiumDisclosureCard({
  icon,
  iconTint = ui.primary,
  title,
  summary,
  bullets,
  fullDetails,
  checked,
  onCheckedChange,
  checkboxLabel,
  requiresInitials = false,
  initials = '',
  onInitialsChange,
  completed = false,
}: PremiumDisclosureCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={[styles.card, completed && styles.cardDone]}>
      <View style={styles.header}>
        <View style={[styles.iconCircle, { backgroundColor: `${iconTint}18` }]}>
          <Ionicons name={icon} size={20} color={iconTint} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.summary}>{summary}</Text>
        </View>
        {completed ? (
          <Ionicons name="checkmark-circle" size={22} color="#16A34A" />
        ) : null}
      </View>

      {bullets?.length ? (
        <View style={styles.bulletBlock}>
          {bullets.map((b) => (
            <View key={b} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>{b}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {fullDetails ? (
        <>
          <Pressable
            pressOpacityFeedback={false}
            onPress={() => setExpanded((v) => !v)}
            style={styles.detailsToggle}
          >
            <Text style={styles.detailsToggleText}>
              {expanded ? 'Hide full details' : 'View full details'}
            </Text>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={ui.primary}
            />
          </Pressable>
          {expanded ? <Text style={styles.fullDetails}>{fullDetails}</Text> : null}
        </>
      ) : null}

      {requiresInitials && onInitialsChange ? (
        <View style={styles.initialsBlock}>
          <Text style={styles.initialsLabel}>Initial here (high-risk acknowledgment)</Text>
          <TextInput
            value={initials}
            onChangeText={onInitialsChange}
            placeholder="e.g. JD"
            autoCapitalize="characters"
            style={styles.initialsInput}
            maxLength={4}
          />
        </View>
      ) : null}

      <Pressable
        pressOpacityFeedback={false}
        onPress={() => onCheckedChange(!checked)}
        style={styles.checkRow}
      >
        <Ionicons
          name={checked ? 'checkbox' : 'square-outline'}
          size={24}
          color={checked ? ui.primary : ui.textSecondary}
        />
        <Text style={styles.checkLabel}>{checkboxLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  cardDone: {
    borderColor: 'rgba(34, 197, 94, 0.35)',
    backgroundColor: '#FAFFFE',
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, gap: 4 },
  title: { fontSize: 16, fontWeight: '800', color: ui.textPrimary, letterSpacing: -0.2 },
  summary: { fontSize: 14, fontWeight: '500', color: ui.textSecondary, lineHeight: 20 },
  bulletBlock: { gap: 6, paddingLeft: 4 },
  bulletRow: { flexDirection: 'row', gap: 8 },
  bulletDot: { fontSize: 14, color: ui.textSecondary, lineHeight: 20 },
  bulletText: { flex: 1, fontSize: 14, color: ui.textPrimary, lineHeight: 20 },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  detailsToggleText: { fontSize: 14, fontWeight: '700', color: ui.primary },
  fullDetails: {
    fontSize: 13,
    color: ui.textSecondary,
    lineHeight: 20,
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 10,
  },
  initialsBlock: { gap: 6 },
  initialsLabel: { fontSize: 12, fontWeight: '600', color: ui.textSecondary },
  initialsInput: {
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '700',
    color: ui.textPrimary,
    maxWidth: 88,
  },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 4 },
  checkLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: ui.textPrimary, lineHeight: 20 },
});
