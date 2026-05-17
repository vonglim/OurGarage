import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { LayoutAnimation, Platform, StyleSheet, Text, UIManager, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = {
  children: React.ReactNode;
  expandedContent: React.ReactNode;
  defaultExpanded?: boolean;
};

export function ExpandableBookingCardShell({ children, expandedContent, defaultExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  };

  return (
    <View style={styles.card}>
      {children}
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Collapse details' : 'Expand details'}
        style={({ pressed }) => [styles.expandRow, pressed && { opacity: 0.85 }]}
      >
        <Text style={styles.expandLabel}>{expanded ? 'Less detail' : 'More detail'}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={ui.textSecondary} />
      </Pressable>
      {expanded ? <View style={styles.expanded}>{expandedContent}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15,23,42,0.08)',
    marginBottom: 10,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(15,23,42,0.06)',
  },
  expandLabel: { fontSize: 12, fontWeight: '600', color: ui.textSecondary },
  expanded: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(15,23,42,0.06)',
  },
});

export function BookingDetailRow({ label, value }: { label: string; value: string }) {
  if (!value || value === '—') return null;
  return (
    <View style={detailStyles.row}>
      <Text style={detailStyles.label}>{label}</Text>
      <Text style={detailStyles.value}>{value}</Text>
    </View>
  );
}

const detailStyles = StyleSheet.create({
  row: { gap: 2 },
  label: { fontSize: 11, fontWeight: '700', color: ui.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  value: { fontSize: 14, color: ui.textPrimary, lineHeight: 20 },
});

export function ProtectionBadge({ label = 'Protection' }: { label?: string }) {
  return (
    <View style={badgeStyles.wrap}>
      <Text style={badgeStyles.text}>{label}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#EEF2FF',
  },
  text: { fontSize: 10, fontWeight: '700', color: '#4338CA' },
});
