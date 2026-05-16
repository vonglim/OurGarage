import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';

export type MeetupMissedPhase = 'pickup' | 'return';

export type RentalMeetupMissedSheetProps = {
  visible: boolean;
  phase: MeetupMissedPhase;
  busy?: boolean;
  onClose: () => void;
  onCompleted: () => void;
  onRunningLate: () => void;
  onReschedule: () => void;
  onNoShow: () => void;
};

export function RentalMeetupMissedSheet({
  visible,
  phase,
  busy = false,
  onClose,
  onCompleted,
  onRunningLate,
  onReschedule,
  onNoShow,
}: RentalMeetupMissedSheetProps) {
  const title = phase === 'pickup' ? 'Did pickup happen?' : 'Did return happen?';
  const subtitle =
    phase === 'pickup'
      ? 'The scheduled pickup time has passed. Let us know so we can keep this rental accurate.'
      : 'The scheduled return time has passed. Confirm what happened before late fees apply.';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <Option label="Yes, completed successfully" onPress={onCompleted} disabled={busy} primary />
          <Option label="Running late" onPress={onRunningLate} disabled={busy} />
          <Option label="Reschedule meetup" onPress={onReschedule} disabled={busy} />
          <Option label="Other party did not show" onPress={onNoShow} disabled={busy} destructive />
          <Pressable pressOpacityFeedback={false} onPress={onClose} style={styles.dismissHit}>
            <Text style={styles.dismissText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function Option({
  label,
  onPress,
  disabled,
  primary,
  destructive,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  destructive?: boolean;
}) {
  return (
    <Pressable
      pressOpacityFeedback={false}
      haptic
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        primary && styles.optionPrimary,
        destructive && styles.optionDestructive,
        pressed && !disabled && { opacity: 0.9 },
        disabled && styles.optionDisabled,
      ]}
    >
      <Text
        style={[
          styles.optionText,
          primary && styles.optionTextPrimary,
          destructive && styles.optionTextDestructive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
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
    paddingTop: 16,
    paddingBottom: 28,
  },
  title: { fontSize: 18, fontWeight: '800', color: ui.textPrimary, marginBottom: 6 },
  subtitle: { fontSize: 14, fontWeight: '500', color: ui.textSecondary, lineHeight: 20, marginBottom: 14 },
  option: {
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    backgroundColor: '#F8FAFC',
  },
  optionPrimary: { backgroundColor: ui.primary, borderColor: ui.primary },
  optionDestructive: { backgroundColor: '#FEF2F2', borderColor: 'rgba(220, 38, 38, 0.25)' },
  optionDisabled: { opacity: 0.5 },
  optionText: { fontSize: 15, fontWeight: '700', color: ui.textPrimary, textAlign: 'center' },
  optionTextPrimary: { color: '#FFFFFF' },
  optionTextDestructive: { color: '#B91C1C' },
  dismissHit: { paddingVertical: 10, alignItems: 'center' },
  dismissText: { fontSize: 14, fontWeight: '600', color: ui.textSecondary },
});
