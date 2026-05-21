import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';

export type WizardPickupChecklistRowProps = {
  label: string;
  checked: boolean;
  readOnly?: boolean;
  helperText?: string;
  onToggle?: () => void;
  onPressReadOnly?: () => void;
  disabled?: boolean;
};

export function WizardPickupChecklistRow({
  label,
  checked,
  readOnly = false,
  helperText,
  onToggle,
  onPressReadOnly,
  disabled = false,
}: WizardPickupChecklistRowProps) {
  const interactive = !disabled && (readOnly ? Boolean(onPressReadOnly) : Boolean(onToggle));
  return (
    <Pressable
      pressOpacityFeedback={false}
      disabled={!interactive}
      onPress={readOnly ? onPressReadOnly : onToggle}
      style={({ pressed }) => [
        styles.row,
        checked && styles.rowChecked,
        pressed && interactive && styles.rowPressed,
        disabled && styles.rowDisabled,
      ]}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
      </View>
      <View style={styles.copy}>
        <Text style={[styles.label, checked && styles.labelChecked]}>{label}</Text>
        {helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
      </View>
      {readOnly && !checked ? (
        <Ionicons name="chevron-forward" size={16} color={ui.textSecondary} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  rowChecked: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  rowPressed: { opacity: 0.88 },
  rowDisabled: { opacity: 0.55 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  boxChecked: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  copy: { flex: 1, minWidth: 0 },
  label: { fontSize: 15, fontWeight: '600', color: ui.textPrimary, lineHeight: 20 },
  labelChecked: { color: '#166534' },
  helper: { fontSize: 12, color: ui.textSecondary, marginTop: 4, lineHeight: 17 },
});
