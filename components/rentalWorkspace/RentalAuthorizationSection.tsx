import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';
import type { RentalAuthorizationState } from '@/lib/rentalActivation';

export type RentalAuthorizationSectionProps = {
  authorization: RentalAuthorizationState;
  viewerRole: 'owner' | 'renter';
  busy?: boolean;
  onOpenAuthorization: () => void;
};

export function RentalAuthorizationSection({
  authorization,
  viewerRole,
  busy = false,
  onOpenAuthorization,
}: RentalAuthorizationSectionProps) {
  const isRenter = viewerRole === 'renter';
  const tone =
    authorization.phase === 'authorized'
      ? styles.pillOk
      : authorization.phase === 'failed_authorization'
        ? styles.pillError
        : styles.pillPending;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Rental authorization</Text>
      <Text style={styles.subtitle}>
        {isRenter
          ? 'Pickup inspection is complete. Review the agreement, authorize the security hold, and sign to officially activate your rental.'
          : 'The renter must review the agreement, authorize the hold, and sign before the rental is officially active.'}
      </Text>
      <View style={[styles.pill, tone]}>
        <Text style={styles.pillText}>{authorization.phaseLabel}</Text>
      </View>
      <View style={styles.rows}>
        <StepRow done={authorization.agreementAcknowledged} label="Agreement reviewed" />
        <StepRow
          done={authorization.preauthorizationSucceeded}
          label="Preauthorization hold"
        />
        <StepRow done={authorization.signaturesComplete} label="Signature complete" />
      </View>
      {isRenter && authorization.phase !== 'authorized' ? (
        <Pressable
          pressOpacityFeedback={false}
          haptic
          disabled={busy}
          onPress={onOpenAuthorization}
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && styles.btnPressed,
            busy && styles.btnDisabled,
          ]}
        >
          <Text style={styles.primaryBtnText}>
            {authorization.phase === 'pending_agreement_review'
              ? 'Review agreement & authorize'
              : authorization.phase === 'failed_authorization'
                ? 'Retry authorization'
                : 'Continue authorization'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function StepRow({ done, label }: { done: boolean; label: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowMark}>{done ? '✓' : '○'}</Text>
      <Text style={[styles.rowLabel, done && styles.rowDone]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    marginBottom: 12,
  },
  title: { fontSize: 17, fontWeight: '700', color: ui.textPrimary },
  subtitle: { fontSize: 14, color: ui.textSecondary, lineHeight: 20 },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  pillText: { fontSize: 13, fontWeight: '600' },
  pillPending: { backgroundColor: '#FFF8E1' },
  pillOk: { backgroundColor: '#E8F5E9' },
  pillError: { backgroundColor: '#FFEBEE' },
  rows: { gap: 8, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowMark: { width: 18, fontSize: 15, fontWeight: '700' },
  rowLabel: { fontSize: 14, color: ui.textPrimary },
  rowDone: { color: ui.textSecondary },
  primaryBtn: {
    marginTop: 8,
    backgroundColor: ui.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: ui.primaryOn, fontSize: 15, fontWeight: '600' },
  btnPressed: { opacity: 0.9 },
  btnDisabled: { opacity: 0.5 },
});
