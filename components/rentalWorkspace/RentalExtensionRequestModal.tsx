import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';
import { buildExtensionReturnIso } from '@/lib/rentalExtensionProposal';

export type RentalExtensionRequestModalProps = {
  visible: boolean;
  busy?: boolean;
  currentReturnIso: string | null;
  currentPickupIso: string | null;
  meetupLocation: string;
  onClose: () => void;
  onSubmit: (input: {
    meetupTimeIso: string;
    returnTimeIso: string;
    meetupLocation: string;
    extensionNote?: string;
  }) => Promise<boolean>;
};

type Preset = 'plus1' | 'plus2' | 'custom';

export function RentalExtensionRequestModal({
  visible,
  busy = false,
  currentReturnIso,
  currentPickupIso,
  meetupLocation,
  onClose,
  onSubmit,
}: RentalExtensionRequestModalProps) {
  const [preset, setPreset] = useState<Preset>('plus1');
  const [customReturn, setCustomReturn] = useState(() => {
    const base = currentReturnIso ? Date.parse(currentReturnIso) : Date.now();
    return new Date(Number.isFinite(base) ? base + 86_400_000 : Date.now() + 86_400_000);
  });
  const [note, setNote] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  const returnIso = useMemo(() => {
    if (!currentReturnIso) return null;
    if (preset === 'plus1') return buildExtensionReturnIso(currentReturnIso, 1);
    if (preset === 'plus2') return buildExtensionReturnIso(currentReturnIso, 2);
    return customReturn.toISOString();
  }, [currentReturnIso, preset, customReturn]);

  const returnLabel = useMemo(() => {
    if (!returnIso) return '—';
    const d = new Date(returnIso);
    return d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }, [returnIso]);

  const canSubmit =
    Boolean(currentPickupIso && returnIso && meetupLocation.trim()) &&
    !busy &&
    (!currentReturnIso || Date.parse(returnIso!) > Date.parse(currentReturnIso));

  const handleSubmit = async () => {
    if (!currentPickupIso || !returnIso || !canSubmit) return;
    const ok = await onSubmit({
      meetupTimeIso: currentPickupIso,
      returnTimeIso: returnIso,
      meetupLocation: meetupLocation.trim(),
      extensionNote: note.trim() || undefined,
    });
    if (ok) {
      setNote('');
      setPreset('plus1');
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Request extension</Text>
            <Pressable pressOpacityFeedback={false} onPress={onClose} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={ui.textSecondary} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.disclaimer}>
              Extensions must be approved by the owner to avoid late return fees.
            </Text>
            <View style={styles.presetRow}>
              {(
                [
                  ['plus1', '+1 day'],
                  ['plus2', '+2 days'],
                  ['custom', 'Custom'],
                ] as const
              ).map(([key, label]) => (
                <Pressable
                  key={key}
                  pressOpacityFeedback={false}
                  onPress={() => setPreset(key)}
                  style={[styles.presetChip, preset === key && styles.presetChipOn]}
                >
                  <Text style={[styles.presetChipText, preset === key && styles.presetChipTextOn]}>{label}</Text>
                </Pressable>
              ))}
            </View>
            {preset === 'custom' ? (
              <Pressable
                pressOpacityFeedback={false}
                onPress={() => setShowPicker(true)}
                style={styles.customDateBtn}
              >
                <Ionicons name="calendar-outline" size={18} color={ui.primary} />
                <Text style={styles.customDateText}>{returnLabel}</Text>
              </Pressable>
            ) : (
              <Text style={styles.preview}>New return: {returnLabel}</Text>
            )}
            {showPicker && preset === 'custom' ? (
              <DateTimePicker
                value={customReturn}
                mode="datetime"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minimumDate={
                  currentReturnIso && Number.isFinite(Date.parse(currentReturnIso))
                    ? new Date(Date.parse(currentReturnIso) + 60_000)
                    : new Date()
                }
                onChange={(_, d) => {
                  if (Platform.OS === 'android') setShowPicker(false);
                  if (d) setCustomReturn(d);
                }}
              />
            ) : null}
            <Text style={styles.noteLabel}>Optional note</Text>
            <TextInput
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              placeholder="Why you need more time…"
              placeholderTextColor={ui.textSecondary}
              multiline
              maxLength={280}
            />
            <Pressable
              pressOpacityFeedback={false}
              haptic
              disabled={!canSubmit}
              onPress={() => void handleSubmit()}
              style={({ pressed }) => [
                styles.submit,
                !canSubmit && styles.submitDisabled,
                pressed && canSubmit && styles.submitPressed,
              ]}
            >
              <Text style={styles.submitText}>{busy ? 'Sending…' : 'Send extension request'}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 28,
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: { fontSize: 18, fontWeight: '800', color: ui.textPrimary, letterSpacing: -0.3 },
  disclaimer: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B45309',
    lineHeight: 18,
    marginBottom: 12,
  },
  presetRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  presetChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    alignItems: 'center',
  },
  presetChipOn: { backgroundColor: ui.primary, borderColor: ui.primary },
  presetChipText: { fontSize: 14, fontWeight: '700', color: ui.textPrimary },
  presetChipTextOn: { color: '#FFFFFF' },
  preview: { fontSize: 14, fontWeight: '700', color: ui.textPrimary, marginBottom: 12 },
  customDateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    marginBottom: 8,
  },
  customDateText: { fontSize: 14, fontWeight: '700', color: ui.primary },
  noteLabel: { fontSize: 12, fontWeight: '700', color: ui.textSecondary, marginBottom: 6 },
  noteInput: {
    minHeight: 72,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    padding: 10,
    fontSize: 14,
    color: ui.textPrimary,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  submit: {
    backgroundColor: ui.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitPressed: { opacity: 0.92 },
  submitDisabled: { backgroundColor: 'rgba(15, 23, 42, 0.12)' },
  submitText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
});
