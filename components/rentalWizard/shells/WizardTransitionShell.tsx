import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Pressable } from '@/components/Pressable';
import { WizardCancellationBannerSlot } from '@/components/rentalCancellation/WizardCancellationBannerSlot';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import {
  wizardContentGutterStyle,
  wizardLayout,
  wizardScreenBleedStyle,
  wizardScrollBottomPadding,
} from '@/constants/wizardLayout';
import { ui } from '@/constants/appUi';

export type WizardTransitionShellProps = {
  /** Shown in header when `hideHeaderTitle` is false. */
  title?: string;
  headline: string;
  subheadline?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconTint?: 'purple' | 'green';
  /** Omit header title — back + optional messages only. */
  hideHeaderTitle?: boolean;
  onBack: () => void;
  onOpenMessages?: () => void;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  children?: React.ReactNode;
};

export function WizardTransitionShell({
  title,
  headline,
  subheadline,
  icon = 'checkmark-circle',
  iconTint = 'purple',
  hideHeaderTitle = false,
  onBack,
  onOpenMessages,
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  children,
}: WizardTransitionShellProps) {
  const insets = useSafeAreaInsets();
  const glow = iconTint === 'green' ? 'rgba(34, 197, 94, 0.35)' : 'rgba(129, 140, 248, 0.45)';
  const iconColor = iconTint === 'green' ? '#4ADE80' : '#A5B4FC';

  return (
    <ScreenWrapper
      style={[styles.screenWrap, wizardScreenBleedStyle]}
      innerStyle={styles.screenInner}
      edges={['top', 'left', 'right']}
    >
      <View style={styles.flex}>
        <View style={styles.headerBlock}>
          <View style={[styles.minimalHeader, wizardContentGutterStyle]}>
            <Pressable
              pressOpacityFeedback={false}
              haptic
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={onBack}
              style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="chevron-back" size={24} color="#F8FAFC" />
            </Pressable>
            {!hideHeaderTitle && title ? (
              <Text style={styles.headerTitle} numberOfLines={1}>
                {title}
              </Text>
            ) : (
              <View style={styles.headerTitleSpacer} />
            )}
            {onOpenMessages ? (
              <Pressable
                pressOpacityFeedback={false}
                haptic
                onPress={onOpenMessages}
                accessibilityLabel="Open messages"
                style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.85 }]}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={22} color="#C7D2FE" />
              </Pressable>
            ) : (
              <View style={styles.headerBtn} />
            )}
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: wizardScrollBottomPadding(insets.bottom) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <WizardCancellationBannerSlot />
          <View style={styles.center}>
            <View style={[styles.iconGlow, { backgroundColor: glow }]}>
              <Ionicons name={icon} size={48} color={iconColor} />
            </View>
            <Text style={styles.headline}>{headline}</Text>
            {subheadline ? <Text style={styles.subheadline}>{subheadline}</Text> : null}
            {children}
          </View>
        </ScrollView>

        <View
          style={[
            styles.footer,
            wizardContentGutterStyle,
            { paddingBottom: Math.max(insets.bottom, wizardLayout.footerBottomMin) },
          ]}
        >
          <Pressable
            pressOpacityFeedback={false}
            haptic
            disabled={primaryDisabled}
            onPress={onPrimary}
            style={({ pressed }) => [
              styles.primaryBtn,
              primaryDisabled && styles.primaryBtnDisabled,
              pressed && !primaryDisabled && { opacity: 0.94 },
            ]}
          >
            <Text style={styles.primaryBtnText}>{primaryLabel}</Text>
          </Pressable>
        </View>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  screenWrap: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  screenInner: { flex: 1 },
  flex: { flex: 1 },
  headerBlock: {
    paddingBottom: wizardLayout.headerBlockPaddingBottom,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  minimalHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#F8FAFC',
    textAlign: 'center',
  },
  headerTitleSpacer: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingTop: wizardLayout.scrollPaddingTop,
  },
  center: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 28,
    ...wizardContentGutterStyle,
    gap: wizardLayout.bodyGap,
  },
  iconGlow: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F8FAFC',
    textAlign: 'center',
    letterSpacing: -0.5,
    lineHeight: 34,
    maxWidth: 320,
  },
  subheadline: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(226, 232, 240, 0.78)',
    textAlign: 'center',
    lineHeight: 23,
    maxWidth: 300,
  },
  footer: {
    paddingTop: wizardLayout.footerPaddingTop,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#0F172A',
  },
  primaryBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: wizardLayout.ctaBorderRadius,
    paddingVertical: wizardLayout.ctaPaddingVertical,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: ui.primary },
});
