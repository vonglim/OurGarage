import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/AppHeaders';
import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';

export type WizardTransitionShellProps = {
  title: string;
  headline: string;
  subheadline?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconTint?: 'purple' | 'green';
  onBack: () => void;
  primaryLabel: string;
  onPrimary: () => void;
  children?: React.ReactNode;
};

export function WizardTransitionShell({
  title,
  headline,
  subheadline,
  icon = 'checkmark-circle',
  iconTint = 'purple',
  onBack,
  primaryLabel,
  onPrimary,
  children,
}: WizardTransitionShellProps) {
  const insets = useSafeAreaInsets();
  const glow = iconTint === 'green' ? 'rgba(34, 197, 94, 0.35)' : 'rgba(129, 140, 248, 0.45)';
  const iconColor = iconTint === 'green' ? '#4ADE80' : '#A5B4FC';

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <BackHeader title={title} onBack={onBack} />
      <View style={styles.center}>
        <View style={[styles.iconGlow, { backgroundColor: glow }]}>
          <Ionicons name={icon} size={44} color={iconColor} />
        </View>
        <Text style={styles.headline}>{headline}</Text>
        {subheadline ? <Text style={styles.subheadline}>{subheadline}</Text> : null}
        {children}
      </View>
      <View style={[styles.footer, { paddingBottom: Math.max(16, insets.bottom) }]}>
        <Pressable
          pressOpacityFeedback={false}
          haptic
          onPress={onPrimary}
          style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.94 }]}
        >
          <Text style={styles.primaryBtnText}>{primaryLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  center: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlow: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  headline: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F8FAFC',
    textAlign: 'center',
    letterSpacing: -0.4,
    lineHeight: 30,
    marginBottom: 10,
  },
  subheadline: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(226, 232, 240, 0.82)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  footer: { paddingHorizontal: 20, paddingTop: 12 },
  primaryBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: ui.primary },
});
