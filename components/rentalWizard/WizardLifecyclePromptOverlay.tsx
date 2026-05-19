import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, Modal, StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { wizardLayout } from '@/constants/wizardLayout';
import { ui } from '@/constants/appUi';

export type WizardLifecyclePromptOverlayProps = {
  visible: boolean;
  headline: string;
  body: string;
  detailLines?: string[];
  primaryLabel?: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
};

/**
 * In-wizard realtime lifecycle acknowledgment — celebration modal, not a toast.
 * Reusable for pickup accepted, return accepted, cancellation outcomes, etc.
 */
export function WizardLifecyclePromptOverlay({
  visible,
  headline,
  body,
  detailLines = [],
  primaryLabel = 'Continue',
  onPrimary,
  secondaryLabel,
  onSecondary,
}: WizardLifecyclePromptOverlayProps) {
  const scale = useRef(new Animated.Value(0.94)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    scale.setValue(0.94);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 8, tension: 80, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [opacity, scale, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <Animated.View style={[styles.cardWrap, { opacity, transform: [{ scale }] }]}>
          <View style={styles.card}>
            <View style={styles.iconGlow} />
            <View style={styles.iconCircle}>
              <Ionicons name="checkmark" size={32} color="#FFFFFF" />
            </View>

            <Text style={styles.headline}>{headline}</Text>
            <Text style={styles.body}>{body}</Text>

            {detailLines.length > 0 ? (
              <View style={styles.detailBlock}>
                {detailLines.map((line) => (
                  <Text key={line} style={styles.detailLine} numberOfLines={2}>
                    {line}
                  </Text>
                ))}
              </View>
            ) : null}

            <Pressable
              onPress={onPrimary}
              haptic
              pressOpacityFeedback={false}
              style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.92 }]}
            >
              <Text style={styles.primaryBtnText}>{primaryLabel}</Text>
            </Pressable>

            {secondaryLabel && onSecondary ? (
              <Pressable
                onPress={onSecondary}
                pressOpacityFeedback={false}
                style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.9 }]}
              >
                <Text style={styles.secondaryBtnText}>{secondaryLabel}</Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  cardWrap: {
    width: '100%',
    maxWidth: 360,
  },
  card: {
    backgroundColor: ui.background,
    borderRadius: ui.radiusCard,
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 20,
    alignItems: 'center',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  iconGlow: {
    position: 'absolute',
    top: 20,
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(34, 197, 94, 0.16)',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  headline: {
    fontSize: 22,
    fontWeight: '800',
    color: ui.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.4,
    lineHeight: 28,
  },
  body: {
    fontSize: 15,
    fontWeight: '500',
    color: ui.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 4,
  },
  detailBlock: {
    alignSelf: 'stretch',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  detailLine: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.textPrimary,
    textAlign: 'center',
    lineHeight: 19,
  },
  primaryBtn: {
    alignSelf: 'stretch',
    marginTop: 4,
    backgroundColor: ui.primary,
    borderRadius: wizardLayout.ctaBorderRadius,
    paddingVertical: wizardLayout.ctaPaddingVertical,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: ui.primaryOn,
  },
  secondaryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: ui.primary,
  },
});
