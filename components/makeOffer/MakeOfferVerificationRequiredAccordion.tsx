import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import { Modal, Platform, StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';
import {
  TIMESTAMP_POSSESSION_PROOF_EXAMPLE_ACCESSIBILITY,
  TIMESTAMP_POSSESSION_PROOF_EXAMPLE_PANEL_BODY,
  TIMESTAMP_POSSESSION_PROOF_TILE_LABEL,
  TIMESTAMP_POSSESSION_PROOF_REQUIREMENT,
  TIMESTAMP_POSSESSION_PROOF_SECTION_SUB,
} from '@/lib/timestampPossessionProofCopy';

const PICKUP_VERIFICATION_EXAMPLE = require('@/assets/images/possession-verification-example.png');

const VERIFICATION_MODAL_CAPTION =
  "Same idea as the sample: handwritten @username and today's date on a note beside the full item — proof you had it in hand for this offer.";

export function MakeOfferVerificationRequiredAccordion() {
  const [expanded, setExpanded] = useState(false);
  const [exampleModalVisible, setExampleModalVisible] = useState(false);

  return (
    <View style={styles.card}>
      <Pressable
        pressOpacityFeedback={false}
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={({ pressed }) => [styles.header, expanded && styles.headerExpanded, pressed && styles.headerPressed]}
      >
        <Ionicons name="shield-checkmark-outline" size={18} color={ui.textSecondary} />
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{TIMESTAMP_POSSESSION_PROOF_TILE_LABEL}</Text>
          <Text style={styles.helper}>{expanded ? 'Tap to collapse' : 'Tap for requirements and example'}</Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-down' : 'chevron-forward'}
          size={22}
          color="rgba(51, 65, 85, 0.88)"
        />
      </Pressable>

      {expanded ? (
        <View style={styles.body}>
          <View style={styles.examplePanel}>
            <View style={styles.exampleLeft}>
              <Text style={styles.exampleTitle}>{TIMESTAMP_POSSESSION_PROOF_TILE_LABEL}</Text>
              <Text style={styles.exampleBody}>{TIMESTAMP_POSSESSION_PROOF_REQUIREMENT}</Text>
              <Text style={styles.exampleMuted}>{TIMESTAMP_POSSESSION_PROOF_SECTION_SUB}</Text>
            </View>
            <Pressable
              pressOpacityFeedback={false}
              onPress={() => setExampleModalVisible(true)}
              style={({ pressed }) => [styles.exampleImageWrap, pressed && styles.exampleImageWrapPressed]}
              accessibilityRole="button"
              accessibilityLabel={TIMESTAMP_POSSESSION_PROOF_EXAMPLE_ACCESSIBILITY}
            >
              <Image source={PICKUP_VERIFICATION_EXAMPLE} style={styles.exampleImage} contentFit="cover" />
              <View style={styles.exampleBadge}>
                <Text style={styles.exampleBadgeText}>EXAMPLE</Text>
              </View>
              <View style={styles.exampleExpandHint} pointerEvents="none">
                <Ionicons name="expand-outline" size={15} color="#FFFFFF" />
              </View>
            </Pressable>
          </View>
        </View>
      ) : null}

      <Modal visible={exampleModalVisible} transparent animationType="fade" onRequestClose={() => setExampleModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setExampleModalVisible(false)} />
          <View style={styles.modalInner} pointerEvents="box-none">
            <Pressable
              pressOpacityFeedback={false}
              onPress={() => setExampleModalVisible(false)}
              style={styles.modalCloseRow}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
            <Image source={PICKUP_VERIFICATION_EXAMPLE} style={styles.modalImage} contentFit="contain" />
            <Text style={styles.modalCaption}>{VERIFICATION_MODAL_CAPTION}</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.1)',
    backgroundColor: 'rgba(248, 250, 252, 0.92)',
    overflow: 'hidden',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 12,
    minHeight: 52,
  },
  headerExpanded: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15, 23, 42, 0.09)',
  },
  headerPressed: {
    backgroundColor: 'rgba(15, 23, 42, 0.045)',
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.textPrimary,
  },
  helper: {
    fontSize: 12,
    color: ui.textMuted,
    lineHeight: 16,
    fontWeight: '500',
  },
  body: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 12,
  },
  examplePanel: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 11,
    borderRadius: ui.radiusCard,
    backgroundColor: 'rgba(34, 197, 94, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.22)',
  },
  exampleLeft: {
    flex: 1,
    minWidth: 0,
  },
  exampleTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 6,
  },
  exampleBody: {
    fontSize: 12,
    color: ui.textSecondary,
    lineHeight: 16,
    marginBottom: 4,
  },
  exampleMuted: {
    fontSize: 11,
    color: ui.textMuted,
    lineHeight: 15,
  },
  exampleImageWrap: {
    width: 96,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(22, 101, 52, 0.35)',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 5,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  exampleImageWrapPressed: {
    opacity: 0.9,
  },
  exampleImage: {
    width: '100%',
    height: 96,
    borderRadius: 10,
  },
  exampleBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(34, 197, 94, 0.95)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  exampleBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  exampleExpandHint: {
    position: 'absolute',
    right: 5,
    bottom: 5,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.52)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    padding: 20,
  },
  modalInner: {
    backgroundColor: ui.surfaceStriped,
    borderRadius: ui.radiusCard,
    padding: 16,
    maxHeight: '88%',
  },
  modalCloseRow: {
    alignSelf: 'flex-end',
    marginBottom: 8,
  },
  modalCloseText: {
    color: ui.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  modalImage: {
    width: '100%',
    height: 360,
    borderRadius: 10,
    backgroundColor: ui.surfaceNeutral,
  },
  modalCaption: {
    fontSize: 12,
    color: ui.textMuted,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 16,
  },
});
