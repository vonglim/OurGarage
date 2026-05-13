import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';

export type RentalWorkspaceUpdatesSectionProps = {
  activityLine: string;
  messagePreview: string;
  messageMeta?: string;
  unreadCount: number;
  onOpenConversation: () => void;
};

export function RentalWorkspaceUpdatesSection({
  activityLine,
  messagePreview,
  messageMeta,
  unreadCount,
  onOpenConversation,
}: RentalWorkspaceUpdatesSectionProps) {
  return (
    <Pressable
      pressOpacityFeedback={false}
      haptic
      onPress={onOpenConversation}
      style={({ pressed }) => [styles.wrap, pressed && { opacity: 0.9 }]}
      accessibilityRole="button"
      accessibilityLabel="Open updates and conversation"
    >
      <View style={styles.top}>
        <Text style={styles.title}>Updates</Text>
        {unreadCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : String(unreadCount)}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.row}>
        <Ionicons name="pulse-outline" size={14} color="rgba(107, 114, 128, 0.85)" style={styles.rowIcon} />
        <Text style={styles.activity} numberOfLines={2}>
          {activityLine}
        </Text>
      </View>
      <View style={styles.row}>
        <Ionicons name="chatbubble-outline" size={14} color="rgba(107, 114, 128, 0.85)" style={styles.rowIcon} />
        <View style={styles.msgCol}>
          <Text style={styles.msg} numberOfLines={2}>
            {messagePreview}
          </Text>
          {messageMeta ? (
            <Text style={styles.meta} numberOfLines={1}>
              {messageMeta}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.footer}>
        <Text style={styles.footerText}>Open conversation</Text>
        <Ionicons name="chevron-forward" size={14} color="rgba(11, 31, 58, 0.55)" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    paddingVertical: 8,
    paddingHorizontal: 2,
    marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15, 23, 42, 0.06)',
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  title: { fontSize: 11, fontWeight: '800', color: 'rgba(15, 23, 42, 0.55)', letterSpacing: 0.4 },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11, 31, 58, 0.85)',
  },
  badgeText: { fontSize: 9, fontWeight: '800', color: '#FFFFFF' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  rowIcon: { marginTop: 1 },
  activity: { flex: 1, fontSize: 13, fontWeight: '600', color: ui.textPrimary, lineHeight: 18 },
  msgCol: { flex: 1, minWidth: 0 },
  msg: { fontSize: 12, fontWeight: '500', color: ui.textSecondary, lineHeight: 17 },
  meta: { marginTop: 2, fontSize: 11, fontWeight: '600', color: 'rgba(107, 114, 128, 0.9)' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 4,
    marginTop: 4,
    paddingTop: 4,
  },
  footerText: { fontSize: 12, fontWeight: '700', color: 'rgba(11, 31, 58, 0.55)' },
});
