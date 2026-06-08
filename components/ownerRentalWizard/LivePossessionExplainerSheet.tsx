import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { WizardFormSheet } from '@/components/wizard/WizardFormSheet';
import { ui } from '@/constants/appUi';

export type LivePossessionExplainerSheetProps = {
  visible: boolean;
  onContinue: (dontShowAgain: boolean) => void;
  onCancel: () => void;
};

const VERIFY_BULLETS = [
  'You had possession of the item before handoff',
  'The item was present at pickup time',
  'The photo reflects the current condition of the item',
] as const;

const TIPS = [
  'Include the entire item in the frame',
  'Take the photo near the meetup time',
  'Ensure the item is clearly visible and well lit',
] as const;

const GOOD_PHOTO_BULLETS = [
  'Entire item visible',
  'Taken near pickup time',
  'Clear and well lit',
] as const;

export function LivePossessionExplainerSheet({
  visible,
  onContinue,
  onCancel,
}: LivePossessionExplainerSheetProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    if (visible) setDontShowAgain(false);
  }, [visible]);

  return (
    <WizardFormSheet
      visible={visible}
      title="Live possession photo"
      onClose={onCancel}
      hideCancelButton
      sheetStyle={styles.sheet}
      footer={
        <View style={styles.footer}>
          <Pressable
            pressOpacityFeedback={false}
            onPress={() => onContinue(dontShowAgain)}
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.92 }]}
          >
            <Text style={styles.primaryBtnText}>Continue to camera</Text>
          </Pressable>
          <Pressable
            pressOpacityFeedback={false}
            onPress={onCancel}
            style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.88 }]}
          >
            <Text style={styles.secondaryBtnText}>Cancel</Text>
          </Pressable>
        </View>
      }
    >
      <Text style={styles.lead}>
        Take a photo of the item shortly before handing it to the renter.
      </Text>

      <Text style={styles.sectionTitle}>This photo helps verify that:</Text>
      <View style={styles.bulletList}>
        {VERIFY_BULLETS.map((bullet) => (
          <View key={bullet} style={styles.bulletRow}>
            <Text style={styles.bulletMark}>•</Text>
            <Text style={styles.bulletText}>{bullet}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>For best results:</Text>
      <View style={styles.bulletList}>
        {TIPS.map((tip) => (
          <View key={tip} style={styles.bulletRow}>
            <Text style={styles.bulletMark}>•</Text>
            <Text style={styles.bulletText}>{tip}</Text>
          </View>
        ))}
      </View>

      <View style={styles.exampleCallout}>
        <Text style={styles.exampleTitle}>📷 Good photo:</Text>
        <View style={styles.exampleBulletList}>
          {GOOD_PHOTO_BULLETS.map((bullet) => (
            <View key={bullet} style={styles.bulletRow}>
              <Text style={styles.bulletMark}>•</Text>
              <Text style={styles.exampleBulletText}>{bullet}</Text>
            </View>
          ))}
        </View>
      </View>

      <Pressable
        pressOpacityFeedback={false}
        onPress={() => setDontShowAgain((v) => !v)}
        style={styles.checkboxRow}
      >
        <Ionicons
          name={dontShowAgain ? 'checkbox' : 'square-outline'}
          size={22}
          color={dontShowAgain ? ui.primary : ui.textSecondary}
        />
        <Text style={styles.checkboxLabel}>Don&apos;t show this again</Text>
      </Pressable>
    </WizardFormSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    minHeight: '72%',
  },
  lead: {
    fontSize: 15,
    fontWeight: '600',
    color: ui.textPrimary,
    lineHeight: 22,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.textPrimary,
    marginTop: 4,
  },
  bulletList: { gap: 8 },
  bulletRow: { flexDirection: 'row', gap: 8, paddingLeft: 2 },
  bulletMark: { fontSize: 14, color: ui.textSecondary, lineHeight: 20 },
  bulletText: { flex: 1, fontSize: 14, color: ui.textPrimary, lineHeight: 20 },
  exampleCallout: {
    backgroundColor: '#F0F9FF',
    borderRadius: 12,
    padding: 12,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#BAE6FD',
    marginTop: 4,
  },
  exampleTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: ui.textPrimary,
  },
  exampleBulletList: { gap: 4 },
  exampleBulletText: { flex: 1, fontSize: 13, color: ui.textSecondary, lineHeight: 18 },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    paddingVertical: 4,
  },
  checkboxLabel: { flex: 1, fontSize: 14, color: ui.textPrimary },
  footer: { gap: 10 },
  primaryBtn: {
    backgroundColor: ui.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: ui.primaryOn, fontSize: 15, fontWeight: '700' },
  secondaryBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: { color: ui.textSecondary, fontSize: 15, fontWeight: '600' },
});
