import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { WizardFormSheet } from '@/components/wizard/WizardFormSheet';
import { snapDateTimeToQuarterHour } from '@/lib/dateTimeScheduling';
import {
  applyTimeToLockedMeetupDate,
  formatMeetupTimeLabel,
} from '@/lib/rentalWizard/coordinateMeetupSchedule';
import { wizardLayout } from '@/constants/wizardLayout';
import { ui } from '@/constants/appUi';

export type WizardTimeProposalSheetProps = {
  visible: boolean;
  initialIso: string | null;
  /** Rental schedule day — only hour/minute may change. */
  lockedDateYmd: string;
  title?: string;
  dateHint?: string;
  onClose: () => void;
  onSave: (iso: string) => void;
};

function initialTimeOnLocked(lockedDateYmd: string, iso: string | null): Date {
  if (iso) {
    const t = Date.parse(iso);
    if (Number.isFinite(t)) {
      return new Date(Date.parse(applyTimeToLockedMeetupDate(lockedDateYmd, new Date(t))));
    }
  }
  return new Date(Date.parse(applyTimeToLockedMeetupDate(lockedDateYmd, new Date(2000, 0, 1, 17, 0, 0, 0))));
}

export function WizardTimeProposalSheet({
  visible,
  initialIso,
  lockedDateYmd,
  title = 'Choose meetup time',
  dateHint,
  onClose,
  onSave,
}: WizardTimeProposalSheetProps) {
  const [draft, setDraft] = useState(() => initialTimeOnLocked(lockedDateYmd, initialIso));

  useEffect(() => {
    if (visible) {
      setDraft(initialTimeOnLocked(lockedDateYmd, initialIso));
    }
  }, [visible, initialIso, lockedDateYmd]);

  const timePreview = formatMeetupTimeLabel(draft);

  const onPickerChange = (_: unknown, selected?: Date) => {
    if (!selected) return;
    const iso = applyTimeToLockedMeetupDate(lockedDateYmd, selected);
    setDraft(snapDateTimeToQuarterHour(new Date(Date.parse(iso))));
  };

  return (
    <WizardFormSheet
      visible={visible}
      title={title}
      onClose={onClose}
      footer={
        <Pressable
          pressOpacityFeedback={false}
          onPress={() => {
            onSave(applyTimeToLockedMeetupDate(lockedDateYmd, draft));
            onClose();
          }}
          style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.92 }]}
        >
          <Text style={styles.saveBtnText}>Save time</Text>
        </Pressable>
      }
    >
      {dateHint ? <Text style={styles.dateHint}>{dateHint}</Text> : null}
      <Text style={styles.preview}>{timePreview}</Text>
      <View style={styles.pickerShell}>
        <DateTimePicker
          value={draft}
          mode="time"
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
  dateHint: {
    fontSize: 13,
    fontWeight: '500',
    color: ui.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  preview: {
    fontSize: 17,
    fontWeight: '700',
    color: ui.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
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
