import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { WizardTimeProposalSheet } from '@/components/rentalWizard/modals/WizardTimeProposalSheet';
import { WizardFormSheet } from '@/components/wizard/WizardFormSheet';
import { ui } from '@/constants/appUi';
import { computePickupExtensionIso } from '@/lib/meetupDayLateExtension';
import { formatWizardDateTime } from '@/lib/rentalWizard/formatWizardSchedule';
import { meetupDateHintForYmd } from '@/lib/rentalWizard/coordinateMeetupSchedule';

export type MeetupLateExtensionSheetProps = {
  visible: boolean;
  currentPickupIso: string | null;
  lockedDateYmd: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (newPickupIso: string) => void;
};

const QUICK_MINUTES = [15, 30, 60] as const;

export function MeetupLateExtensionSheet({
  visible,
  currentPickupIso,
  lockedDateYmd,
  busy = false,
  onClose,
  onSubmit,
}: MeetupLateExtensionSheetProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [selectedIso, setSelectedIso] = useState<string | null>(null);

  const baselineIso = currentPickupIso ?? new Date().toISOString();

  const quickOptions = useMemo(
    () =>
      QUICK_MINUTES.map((minutes) => ({
        minutes,
        iso: computePickupExtensionIso(baselineIso, minutes),
      })),
    [baselineIso]
  );

  const requestedIso = selectedIso ?? quickOptions[0]?.iso ?? null;

  const resetAndClose = () => {
    setSelectedIso(null);
    setCustomOpen(false);
    onClose();
  };

  return (
    <>
      <WizardFormSheet
        visible={visible && !customOpen}
        title="Request time extension"
        onClose={resetAndClose}
        footer={
          <Pressable
            pressOpacityFeedback={false}
            disabled={busy || !requestedIso}
            onPress={() => {
              if (requestedIso) onSubmit(requestedIso);
            }}
            style={({ pressed }) => [
              styles.submitBtn,
              pressed && !busy && { opacity: 0.92 },
              (busy || !requestedIso) && styles.disabled,
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitText}>Send request</Text>
            )}
          </Pressable>
        }
      >
        <Text style={styles.lead}>
          Pick a new pickup time. The other party must accept before it takes effect.
        </Text>
        <View style={styles.summary}>
          <Text style={styles.summaryLabel}>Current pickup time</Text>
          <Text style={styles.summaryValue}>
            {currentPickupIso ? formatWizardDateTime(currentPickupIso) : 'Not set'}
          </Text>
        </View>
        <View style={styles.quickRow}>
          {quickOptions.map((opt) => {
            const active = requestedIso === opt.iso;
            return (
              <Pressable
                key={opt.minutes}
                pressOpacityFeedback={false}
                disabled={busy}
                onPress={() => setSelectedIso(opt.iso)}
                style={({ pressed }) => [
                  styles.quickChip,
                  active && styles.quickChipActive,
                  pressed && !busy && { opacity: 0.92 },
                ]}
              >
                <Text style={[styles.quickChipText, active && styles.quickChipTextActive]}>
                  +{opt.minutes} min
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          pressOpacityFeedback={false}
          disabled={busy}
          onPress={() => setCustomOpen(true)}
          style={({ pressed }) => [styles.customBtn, pressed && !busy && { opacity: 0.92 }]}
        >
          <Text style={styles.customBtnText}>Custom time</Text>
        </Pressable>
        {requestedIso ? (
          <View style={styles.summary}>
            <Text style={styles.summaryLabel}>Requested pickup time</Text>
            <Text style={styles.summaryValueAccent}>{formatWizardDateTime(requestedIso)}</Text>
          </View>
        ) : null}
      </WizardFormSheet>

      <WizardTimeProposalSheet
        visible={visible && customOpen}
        initialIso={requestedIso ?? baselineIso}
        lockedDateYmd={lockedDateYmd}
        title="Custom pickup time"
        dateHint={meetupDateHintForYmd(lockedDateYmd)}
        onClose={() => setCustomOpen(false)}
        onSave={(iso) => {
          setSelectedIso(iso);
          setCustomOpen(false);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  lead: { fontSize: 14, color: ui.textSecondary, lineHeight: 20, marginBottom: 12 },
  summary: { gap: 4, marginBottom: 12 },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: ui.textSecondary,
  },
  summaryValue: { fontSize: 15, fontWeight: '600', color: ui.textPrimary },
  summaryValueAccent: { fontSize: 15, fontWeight: '700', color: '#B45309' },
  quickRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  quickChip: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  quickChipActive: { backgroundColor: '#EEF2FF', borderColor: ui.primary },
  quickChipText: { fontSize: 14, fontWeight: '700', color: ui.textPrimary },
  quickChipTextActive: { color: ui.primary },
  customBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  customBtnText: { fontSize: 15, fontWeight: '700', color: ui.primary },
  submitBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: ui.primary,
  },
  submitText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  disabled: { opacity: 0.55 },
});
