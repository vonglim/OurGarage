import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import type { AgreementSectionDef } from '@/lib/rentalAuthorization/agreementSections';
import { ui } from '@/constants/appUi';

export type LegalAccordionSectionProps = {
  section: AgreementSectionDef;
  expanded?: boolean;
  onToggle?: () => void;
  children?: React.ReactNode;
  checkboxChecked?: boolean;
  onCheckboxChange?: (checked: boolean) => void;
};

export function LegalAccordionSection({
  section,
  expanded: expandedProp,
  onToggle,
  children,
  checkboxChecked = false,
  onCheckboxChange,
}: LegalAccordionSectionProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = expandedProp ?? internalExpanded;
  const toggle = onToggle ?? (() => setInternalExpanded((v) => !v));

  return (
    <View style={styles.card}>
      <Pressable
        pressOpacityFeedback={false}
        onPress={toggle}
        style={({ pressed }) => [styles.header, pressed && { opacity: 0.9 }]}
      >
        <View style={styles.headerText}>
          <Text style={styles.title}>{section.title}</Text>
          <Text style={styles.summary} numberOfLines={expanded ? undefined : 2}>
            {section.summary}
          </Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={ui.textSecondary} />
      </Pressable>

      {expanded ? (
        <View style={styles.body}>
          {section.bullets?.map((bullet) => (
            <View key={bullet} style={styles.bulletRow}>
              <Text style={styles.bulletMark}>•</Text>
              <Text style={styles.bulletText}>{bullet}</Text>
            </View>
          ))}
          {children}
          {section.requiresCheckbox && section.checkboxLabel && onCheckboxChange ? (
            <Pressable
              pressOpacityFeedback={false}
              onPress={() => onCheckboxChange(!checkboxChecked)}
              style={styles.checkboxRow}
            >
              <Ionicons
                name={checkboxChecked ? 'checkbox' : 'square-outline'}
                size={22}
                color={checkboxChecked ? ui.primary : ui.textSecondary}
              />
              <Text style={styles.checkboxLabel}>{section.checkboxLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
  },
  headerText: { flex: 1, gap: 4 },
  title: { fontSize: 16, fontWeight: '700', color: ui.textPrimary },
  summary: { fontSize: 14, color: ui.textSecondary, lineHeight: 20 },
  body: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  bulletRow: { flexDirection: 'row', gap: 8, paddingLeft: 4 },
  bulletMark: { fontSize: 14, color: ui.textSecondary, lineHeight: 20 },
  bulletText: { flex: 1, fontSize: 14, color: ui.textPrimary, lineHeight: 20 },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 8 },
  checkboxLabel: { flex: 1, fontSize: 14, color: ui.textPrimary, lineHeight: 20 },
});
