import React, { useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { WizardFormSheet } from '@/components/wizard/WizardFormSheet';
import { ui } from '@/constants/appUi';
import { evaluateCancellationRequestEligibility } from '@/lib/rentalCancellation/rentalCancellationGates';
import {
  RENTAL_CANCELLATION_REASONS,
  type RentalCancellationReasonKey,
} from '@/lib/rentalCancellation/types';
import type { UnifiedRentalRow } from '@/lib/fetchUnifiedRentalsForUser';

export type RentalCancelRequestSheetProps = {
  visible: boolean;
  rental: UnifiedRentalRow | null;
  viewerUserId: string;
  onClose: () => void;
  onSubmit: (reason: RentalCancellationReasonKey) => Promise<void>;
};

export function RentalCancelRequestSheet({
  visible,
  rental,
  viewerUserId,
  onClose,
  onSubmit,
}: RentalCancelRequestSheetProps) {
  const [step, setStep] = useState<'reason' | 'confirm'>('reason');
  const [selected, setSelected] = useState<RentalCancellationReasonKey | null>(null);
  const [busy, setBusy] = useState(false);

  const eligibility = rental
    ? evaluateCancellationRequestEligibility(rental, { viewerUserId })
    : { allowed: false as const, message: '' };
  const reportIssue = !eligibility.allowed && 'reportIssue' in eligibility && eligibility.reportIssue;
  const contactSupport = 'contactSupport' in eligibility && eligibility.contactSupport;

  const reset = () => {
    setStep('reason');
    setSelected(null);
    setBusy(false);
  };

  const handleClose = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const handleSend = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await onSubmit(selected);
      reset();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <WizardFormSheet
      visible={visible}
      title={step === 'reason' ? 'Need to cancel this rental?' : 'Send cancellation request'}
      onClose={handleClose}
      footer={
        step === 'reason' ? (
          !eligibility.allowed ? (
            reportIssue ? (
              <Text style={styles.body}>{eligibility.message}</Text>
            ) : contactSupport ? (
              <Pressable
                haptic
                onPress={() => void Linking.openURL('mailto:support@ourgarage.app')}
                style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.92 }]}
              >
                <Text style={styles.primaryBtnText}>Contact support</Text>
              </Pressable>
            ) : null
          ) : (
            <Pressable
              haptic
              disabled={!selected}
              onPress={() => setStep('confirm')}
              style={({ pressed }) => [
                styles.primaryBtn,
                !selected && styles.primaryBtnDisabled,
                pressed && selected && { opacity: 0.92 },
              ]}
            >
              <Text style={styles.primaryBtnText}>Continue</Text>
            </Pressable>
          )
        ) : (
          <Pressable
            haptic
            disabled={busy}
            onPress={() => void handleSend()}
            style={({ pressed }) => [styles.primaryBtn, pressed && !busy && { opacity: 0.92 }]}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryBtnText}>Send cancellation request</Text>
            )}
          </Pressable>
        )
      }
    >
      {!eligibility.allowed ? (
        <Text style={styles.body}>{eligibility.message}</Text>
      ) : step === 'reason' ? (
        <View style={styles.reasonList}>
          <Text style={styles.lead}>Why are you requesting to cancel?</Text>
          {RENTAL_CANCELLATION_REASONS.map((item) => {
            const on = selected === item.key;
            return (
              <Pressable
                key={item.key}
                haptic
                onPress={() => setSelected(item.key)}
                style={({ pressed }) => [
                  styles.reasonRow,
                  on && styles.reasonRowOn,
                  pressed && { opacity: 0.92 },
                ]}
              >
                <Text style={[styles.reasonLabel, on && styles.reasonLabelOn]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.confirmBlock}>
          <Text style={styles.confirmLead}>
            This sends a cancellation request to the other person.
          </Text>
          <Text style={styles.confirmSub}>
            The rental will remain active until they respond. You can keep messaging and
            coordinating in the meantime.
          </Text>
          {selected ? (
            <Text style={styles.confirmReason}>
              Reason: {RENTAL_CANCELLATION_REASONS.find((r) => r.key === selected)?.label}
            </Text>
          ) : null}
          <Pressable haptic onPress={() => setStep('reason')} style={styles.backLink}>
            <Text style={styles.backLinkText}>Change reason</Text>
          </Pressable>
        </View>
      )}
    </WizardFormSheet>
  );
}

const styles = StyleSheet.create({
  lead: { fontSize: 15, fontWeight: '600', color: ui.textPrimary, marginBottom: 12 },
  body: { fontSize: 15, lineHeight: 22, color: ui.textSecondary },
  reasonList: { gap: 8 },
  reasonRow: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  reasonRowOn: { borderColor: ui.primary, backgroundColor: '#F5F3FF' },
  reasonLabel: { fontSize: 15, fontWeight: '600', color: ui.textPrimary },
  reasonLabelOn: { color: ui.primary },
  confirmBlock: { gap: 12 },
  confirmLead: { fontSize: 17, fontWeight: '700', color: ui.textPrimary, lineHeight: 24 },
  confirmSub: { fontSize: 14, lineHeight: 21, color: ui.textSecondary },
  confirmReason: { fontSize: 14, fontWeight: '600', color: ui.textPrimary },
  backLink: { alignSelf: 'flex-start', paddingVertical: 4 },
  backLinkText: { fontSize: 14, fontWeight: '700', color: ui.primary },
  primaryBtn: {
    backgroundColor: ui.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
