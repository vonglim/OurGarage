import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { WizardFormSheet } from '@/components/wizard/WizardFormSheet';
import { snapDateTimeToQuarterHour } from '@/lib/dateTimeScheduling';
import { wizardLayout } from '@/constants/wizardLayout';
import { ui } from '@/constants/appUi';

export type WizardTimeProposalSheetProps = {
  visible: boolean;
  initialIso: string | null;
  onClose: () => void;
  onSave: (iso: string) => void;
};

function initialDate(iso: string | null): Date {
  if (iso) {
    const t = Date.parse(iso);
    if (Number.isFinite(t)) return snapDateTimeToQuarterHour(new Date(t));
  }
  const d = new Date();
  d.setHours(17, 0, 0, 0);
  return snapDateTimeToQuarterHour(d);
}

type IosPickerMode = 'date' | 'time';

export function WizardTimeProposalSheet({
  visible,
  initialIso,
  onClose,
  onSave,
}: WizardTimeProposalSheetProps) {
  const [draft, setDraft] = useState(() => initialDate(initialIso));
  const [iosMode, setIosMode] = useState<IosPickerMode>('date');
  const [androidMode, setAndroidMode] = useState<IosPickerMode>('date');
  useEffect(() => {
    if (visible) {
      setDraft(initialDate(initialIso));
      setIosMode('date');
      setAndroidMode('date');
    }
  }, [visible, initialIso]);

  const label = draft.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const pickerMode = Platform.OS === 'ios' ? iosMode : androidMode;
  const onPickerChange = (_: unknown, selected?: Date) => {
    if (!selected) return;
    const snapped = snapDateTimeToQuarterHour(selected);
    if (Platform.OS === 'ios' && iosMode === 'date') {
      setDraft((prev) => {
        const next = new Date(prev);
        next.setFullYear(snapped.getFullYear(), snapped.getMonth(), snapped.getDate());
        return snapDateTimeToQuarterHour(next);
      });
      return;
    }
    if (Platform.OS === 'ios' && iosMode === 'time') {
      setDraft((prev) => {
        const next = new Date(prev);
        next.setHours(snapped.getHours(), snapped.getMinutes(), 0, 0);
        return snapDateTimeToQuarterHour(next);
      });
      return;
    }
    setDraft(snapped);
  };

  return (
    <WizardFormSheet
      visible={visible}
      title="Choose date & time"
      onClose={onClose}
      footer={
        <Pressable
          pressOpacityFeedback={false}
          onPress={() => {
            onSave(snapDateTimeToQuarterHour(draft).toISOString());
            onClose();
          }}
          style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.92 }]}
        >
          <Text style={styles.saveBtnText}>Save time</Text>
        </Pressable>
      }
    >
      <Text style={styles.preview}>{label}</Text>
      <View style={styles.modeRow}>
        {(['date', 'time'] as const).map((key) => {
          const on = pickerMode === key;
          return (
            <Pressable
              key={key}
              onPress={() => {
                if (Platform.OS === 'ios') setIosMode(key);
                else setAndroidMode(key);
              }}
              style={[styles.modeChip, on && styles.modeChipOn]}
            >
              <Text style={[styles.modeChipText, on && styles.modeChipTextOn]}>
                {key === 'date' ? 'Date' : 'Time'}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.pickerShell}>
        <DateTimePicker
          value={draft}
          mode={pickerMode}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          themeVariant="light"
          style={styles.picker}
          onChange={onPickerChange}
        />
      </View>
    </WizardFormSheet>
  );
}

const styles = StyleSheet.create({
  preview: {
    fontSize: 15,
    fontWeight: '600',
    color: ui.textPrimary,
    textAlign: 'center',
  },
  modeRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  modeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  modeChipOn: { backgroundColor: '#EEF2FF' },
  modeChipText: { fontSize: 14, fontWeight: '600', color: ui.textSecondary },
  modeChipTextOn: { color: ui.primary },
  pickerShell: {
    minHeight: wizardLayout.sheetPickerHeight,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    overflow: 'hidden',
  },
  picker: {
    width: '100%',
    height: wizardLayout.sheetPickerHeight,
  },
  saveBtn: {
    backgroundColor: ui.primary,
    borderRadius: wizardLayout.ctaBorderRadius,
    paddingVertical: wizardLayout.ctaPaddingVertical,
    alignItems: 'center',
  },
  saveBtnText: { color: ui.primaryOn, fontSize: 16, fontWeight: '700' },
});
