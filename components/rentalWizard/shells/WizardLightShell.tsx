import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/AppHeaders';
import { Pressable } from '@/components/Pressable';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ui } from '@/constants/appUi';

export type WizardLightShellProps = {
  title: string;
  subtitle?: string;
  onBack: () => void;
  onOpenMessages?: () => void;
  primaryLabel: string;
  primaryDisabled?: boolean;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  footerNote?: string;
  scroll?: boolean;
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

export function WizardLightShell({
  title,
  subtitle,
  onBack,
  onOpenMessages,
  primaryLabel,
  primaryDisabled = false,
  onPrimary,
  secondaryLabel,
  onSecondary,
  footerNote,
  scroll = true,
  children,
  contentContainerStyle,
}: WizardLightShellProps) {
  const insets = useSafeAreaInsets();
  const body = (
    <View style={[styles.body, contentContainerStyle]}>{children}</View>
  );

  return (
    <ScreenWrapper style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <BackHeader
          title={title}
          subtitle={subtitle}
          onBack={onBack}
          rightAccessory={
            onOpenMessages ? (
              <Pressable
                pressOpacityFeedback={false}
                haptic
                onPress={onOpenMessages}
                accessibilityLabel="Open messages"
                style={({ pressed }) => [styles.msgBtn, pressed && { opacity: 0.85 }]}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={22} color={ui.primary} />
              </Pressable>
            ) : undefined
          }
        />
      </View>
      {scroll ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {body}
        </ScrollView>
      ) : (
        <View style={[styles.scroll, styles.scrollContent, { paddingBottom: 100 + insets.bottom }]}>
          {body}
        </View>
      )}
      <View style={[styles.footer, { paddingBottom: Math.max(12, insets.bottom) }]}>
        {footerNote ? <Text style={styles.footerNote}>{footerNote}</Text> : null}
        <Pressable
          pressOpacityFeedback={false}
          haptic
          disabled={primaryDisabled}
          onPress={onPrimary}
          style={({ pressed }) => [
            styles.primaryBtn,
            primaryDisabled && styles.primaryBtnDisabled,
            pressed && !primaryDisabled && { opacity: 0.92 },
          ]}
        >
          <Text style={[styles.primaryBtnText, primaryDisabled && styles.primaryBtnTextDisabled]}>
            {primaryLabel}
          </Text>
        </Pressable>
        {secondaryLabel && onSecondary ? (
          <Pressable
            pressOpacityFeedback={false}
            onPress={onSecondary}
            style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.88 }]}
          >
            <Text style={styles.secondaryBtnText}>{secondaryLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.surfaceStriped },
  header: { paddingHorizontal: 4 },
  msgBtn: { padding: 8 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8 },
  body: { gap: 14 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ui.border,
    backgroundColor: '#FFFFFF',
    gap: 8,
  },
  footerNote: {
    fontSize: 12,
    fontWeight: '500',
    color: ui.textSecondary,
    textAlign: 'center',
    lineHeight: 17,
  },
  primaryBtn: {
    backgroundColor: ui.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  primaryBtnTextDisabled: { color: 'rgba(255,255,255,0.85)' },
  secondaryBtn: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    backgroundColor: '#FFFFFF',
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '600', color: ui.primary },
});
