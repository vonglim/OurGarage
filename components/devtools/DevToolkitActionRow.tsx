import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';

export function DevToolkitActionRow({
  title,
  subtitle,
  onPress,
  disabled,
  tone = 'default',
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger' | 'primary';
}) {
  return (
    <Pressable
      disabled={disabled}
      pressOpacityFeedback={false}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        tone === 'primary' && styles.rowPrimary,
        tone === 'danger' && styles.rowDanger,
        disabled && styles.rowDisabled,
        pressed && !disabled && styles.rowPressed,
      ]}
    >
      <Text style={[styles.title, tone === 'primary' && styles.titleOnPrimary]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.sub, tone === 'primary' && styles.subOnPrimary]}>{subtitle}</Text>
      ) : null}
    </Pressable>
  );
}

export function DevToolkitSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 18 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: ui.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 8,
  },
  row: {
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  rowPrimary: { backgroundColor: '#4F46E5' },
  rowDanger: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  rowPressed: { opacity: 0.88 },
  rowDisabled: { opacity: 0.45 },
  title: { fontSize: 15, fontWeight: '600', color: ui.textPrimary },
  titleOnPrimary: { color: '#FFFFFF' },
  sub: { marginTop: 3, fontSize: 12, color: ui.textSecondary, lineHeight: 17 },
  subOnPrimary: { color: 'rgba(255,255,255,0.85)' },
});
