import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import type { MeetupLifecyclePresentation } from '@/lib/rentalLifecycle/meetupLifecycle';
import { ui } from '@/constants/appUi';

export type OwnerMeetupLifecyclePanelProps = {
  presentation: MeetupLifecyclePresentation;
  onMessageRenter?: () => void;
  onViewRental?: () => void;
};

export function OwnerMeetupLifecyclePanel({
  presentation: p,
  onMessageRenter,
  onViewRental,
}: OwnerMeetupLifecyclePanelProps) {
  const theme = p.theme;
  const isActive = p.phase === 'rental_active';

  return (
    <View style={[styles.card, { borderColor: theme.softBorder, backgroundColor: theme.soft }]}>
      <View style={styles.headerRow}>
        <View style={[styles.iconCircle, { backgroundColor: theme.primary }]}>
          <Ionicons
            name={
              isActive
                ? 'checkmark-circle'
                : p.phase === 'rental_authorization'
                  ? 'document-text-outline'
                  : 'search-outline'
            }
            size={22}
            color="#FFFFFF"
          />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.phaseTag}>{p.theme.label}</Text>
          <Text style={styles.headline}>{p.ownerHeadline}</Text>
        </View>
      </View>
      <Text style={styles.support}>{p.ownerSupport}</Text>

      <View style={styles.progressList}>
        {p.ownerProgressItems.map((item) => (
          <View key={item.id} style={styles.progressRow}>
            <View
              style={[
                styles.progressDot,
                item.status === 'done' && { backgroundColor: theme.primary },
                item.status === 'active' && {
                  backgroundColor: theme.primary,
                  borderWidth: 2,
                  borderColor: theme.softBorder,
                },
                item.status === 'pending' && styles.progressDotPending,
              ]}
            />
            <Text
              style={[
                styles.progressLabel,
                item.status === 'done' && styles.progressDone,
                item.status === 'active' && { color: theme.primary, fontWeight: '700' },
              ]}
            >
              {item.label}
            </Text>
          </View>
        ))}
      </View>

      {onMessageRenter && !isActive ? (
        <Pressable pressOpacityFeedback={false} onPress={onMessageRenter} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnText}>Message renter</Text>
        </Pressable>
      ) : null}
      {onViewRental && isActive ? (
        <Pressable pressOpacityFeedback={false} onPress={onViewRental} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnText}>View rental details</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    marginBottom: 12,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, gap: 2 },
  phaseTag: { fontSize: 11, fontWeight: '700', color: ui.textSecondary, letterSpacing: 0.4 },
  headline: { fontSize: 17, fontWeight: '800', color: ui.textPrimary },
  support: { fontSize: 14, lineHeight: 20, color: ui.textSecondary },
  progressList: { gap: 10, paddingTop: 4 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressDot: { width: 10, height: 10, borderRadius: 5 },
  progressDotPending: { backgroundColor: '#CBD5E1' },
  progressLabel: { fontSize: 14, color: ui.textPrimary },
  progressDone: { color: ui.textSecondary },
  secondaryBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '600', color: ui.textPrimary },
});
