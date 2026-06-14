import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { WizardFormSheet } from '@/components/wizard/WizardFormSheet';
import { ui } from '@/constants/appUi';
import {
  TIMESTAMP_POSSESSION_PROOF_EXPLAINER_LEAD,
  TIMESTAMP_POSSESSION_PROOF_GOOD_PHOTO_BULLETS,
  TIMESTAMP_POSSESSION_PROOF_LABEL,
  TIMESTAMP_POSSESSION_PROOF_TIPS,
  TIMESTAMP_POSSESSION_PROOF_VERIFY_BULLETS,
} from '@/lib/timestampPossessionProofCopy';

export type LivePossessionExplainerSheetProps = {
  visible: boolean;
  onContinue: (dontShowAgain: boolean) => void;
  onCancel: () => void;
};

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
      title={TIMESTAMP_POSSESSION_PROOF_LABEL}
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
      <Text style={styles.lead}>{TIMESTAMP_POSSESSION_PROOF_EXPLAINER_LEAD}</Text>

      <Text style={styles.sectionTitle}>This photo helps verify that:</Text>
      <View style={styles.bulletList}>
        {TIMESTAMP_POSSESSION_PROOF_VERIFY_BULLETS.map((bullet) => (
          <View key={bullet} style={styles.bulletRow}>
            <Text style={styles.bulletMark}>•</Text>
            <Text style={styles.bulletText}>{bullet}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>For best results:</Text>
      <View style={styles.bulletList}>
        {TIMESTAMP_POSSESSION_PROOF_TIPS.map((tip) => (
          <View key={tip} style={styles.bulletRow}>
            <Text style={styles.bulletMark}>•</Text>
            <Text style={styles.bulletText}>{tip}</Text>
          </View>
        ))}
      </View>

      <View style={styles.exampleCallout}>
        <Text style={styles.exampleTitle}>📷 Good photo:</Text>
        <View style={styles.exampleBulletList}>
          {TIMESTAMP_POSSESSION_PROOF_GOOD_PHOTO_BULLETS.map((bullet) => (
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
