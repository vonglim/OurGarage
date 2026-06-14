import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';
import { formatWizardDateTime } from '@/lib/rentalWizard/formatWizardSchedule';

export type MeetupPickupProposalBannerProps = {
  acceptedPickupIso: string | null;
  pendingPickupIso: string | null;
  viewerCanAccept: boolean;
  viewerIsProposer: boolean;
  busy?: boolean;
  onAccept: () => void;
  onDecline: () => void;
};

export function MeetupPickupProposalBanner({
  acceptedPickupIso,
  pendingPickupIso,
  viewerCanAccept,
  viewerIsProposer,
  busy = false,
  onAccept,
  onDecline,
}: MeetupPickupProposalBannerProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Pickup time update requested</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Current</Text>
        <Text style={styles.value}>
          {acceptedPickupIso ? formatWizardDateTime(acceptedPickupIso) : 'Not set'}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Requested</Text>
        <Text style={styles.valueAccent}>
          {pendingPickupIso ? formatWizardDateTime(pendingPickupIso) : '—'}
        </Text>
      </View>
      {viewerCanAccept ? (
        <View style={styles.actions}>
          <Pressable
            pressOpacityFeedback={false}
            disabled={busy}
            onPress={onAccept}
            style={({ pressed }) => [styles.acceptBtn, pressed && { opacity: 0.92 }, busy && styles.disabled]}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.acceptText}>Accept</Text>
            )}
          </Pressable>
          <Pressable
            pressOpacityFeedback={false}
            disabled={busy}
            onPress={onDecline}
            style={({ pressed }) => [styles.declineBtn, pressed && { opacity: 0.92 }, busy && styles.disabled]}
          >
            <Text style={styles.declineText}>Decline</Text>
          </Pressable>
        </View>
      ) : viewerIsProposer ? (
        <Text style={styles.waiting}>Waiting for the other party to respond.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 14,
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FDE68A',
  },
  title: { fontSize: 15, fontWeight: '800', color: ui.textPrimary },
  row: { gap: 2 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: ui.textSecondary,
  },
  value: { fontSize: 14, fontWeight: '600', color: ui.textPrimary },
  valueAccent: { fontSize: 14, fontWeight: '700', color: '#B45309' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  acceptBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: ui.primary,
  },
  acceptText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  declineBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  declineText: { fontSize: 15, fontWeight: '700', color: ui.textPrimary },
  waiting: { fontSize: 13, fontWeight: '500', color: ui.textSecondary, marginTop: 2 },
  disabled: { opacity: 0.6 },
});
