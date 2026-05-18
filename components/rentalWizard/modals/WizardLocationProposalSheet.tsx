import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { WizardFormSheet } from '@/components/wizard/WizardFormSheet';
import { wizardLayout } from '@/constants/wizardLayout';
import { ui } from '@/constants/appUi';

export type WizardLocationProposalSheetProps = {
  visible: boolean;
  initialValue: string;
  title?: string;
  onClose: () => void;
  onSave: (location: string) => void;
};

export function WizardLocationProposalSheet({
  visible,
  initialValue,
  title = 'Propose a location',
  onClose,
  onSave,
}: WizardLocationProposalSheetProps) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  const canSave = value.trim().length > 0;

  return (
    <WizardFormSheet
      visible={visible}
      title={title}
      onClose={onClose}
      footer={
        <Pressable
          pressOpacityFeedback={false}
          disabled={!canSave}
          onPress={() => {
            onSave(value.trim());
            onClose();
          }}
          style={({ pressed }) => [
            styles.saveBtn,
            !canSave && styles.saveBtnDisabled,
            pressed && canSave && { opacity: 0.92 },
          ]}
        >
          <Text style={styles.saveBtnText}>Save location</Text>
        </Pressable>
      }
    >
      <Text style={styles.hint}>Enter an address or meetup spot. Map search coming soon.</Text>
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder="e.g. 123 Main St, parking lot B"
        placeholderTextColor={ui.textMuted}
        style={styles.input}
        multiline
        textAlignVertical="top"
        returnKeyType="done"
        blurOnSubmit
      />
    </WizardFormSheet>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 13, color: ui.textSecondary, lineHeight: 18 },
  input: {
    minHeight: 96,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    backgroundColor: '#FFFFFF',
    padding: 14,
    fontSize: 15,
    color: ui.textPrimary,
  },
  saveBtn: {
    backgroundColor: ui.primary,
    borderRadius: wizardLayout.ctaBorderRadius,
    paddingVertical: wizardLayout.ctaPaddingVertical,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnText: { color: ui.primaryOn, fontSize: 16, fontWeight: '700' },
});
