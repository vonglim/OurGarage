import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ui } from '@/constants/appUi';

export function WizardMeetupInfoPanel({
  icon,
  title,
  value,
  actionLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  value: string;
  actionLabel?: string;
}) {
  return (
    <View style={styles.infoPanel}>
      <Ionicons name={icon} size={18} color={ui.primary} />
      <View style={styles.infoText}>
        <Text style={styles.infoTitle}>{title}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
      {actionLabel ? <Text style={styles.infoAction}>{actionLabel}</Text> : null}
    </View>
  );
}

export function WizardMeetupStatusBanner({
  tone,
  title,
  body,
}: {
  tone: 'waiting' | 'ready' | 'info';
  title: string;
  body: string;
}) {
  const bg = tone === 'ready' ? '#ECFDF5' : tone === 'waiting' ? '#EEF2FF' : '#F5F3FF';
  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <Ionicons
        name={tone === 'ready' ? 'checkmark-circle' : 'time-outline'}
        size={18}
        color={tone === 'ready' ? '#16A34A' : ui.primary}
      />
      <View style={styles.bannerText}>
        <Text style={styles.bannerTitle}>{title}</Text>
        {body ? <Text style={styles.bannerBody}>{body}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  infoPanel: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  infoText: { flex: 1, gap: 2 },
  infoTitle: { fontSize: 12, fontWeight: '600', color: ui.textSecondary },
  infoValue: { fontSize: 15, fontWeight: '600', color: ui.textPrimary },
  infoAction: { fontSize: 13, fontWeight: '600', color: ui.primary },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 12,
    padding: 12,
  },
  bannerText: { flex: 1, gap: 2 },
  bannerTitle: { fontSize: 14, fontWeight: '700', color: ui.textPrimary },
  bannerBody: { fontSize: 13, color: ui.textSecondary, lineHeight: 18 },
});
