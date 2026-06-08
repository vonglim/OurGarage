import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppKeyboardAwareScrollView } from '@/components/AppKeyboardAwareScrollView';
import { Pressable } from '@/components/Pressable';
import { AuthGradientButton } from '@/components/rentalWizard/authorization/AuthGradientButton';
import { AuthorizationProgressHeader } from '@/components/rentalWizard/authorization/AuthorizationProgressHeader';
import { authPremium, authType } from '@/components/rentalWizard/authorization/authPremiumTheme';
import { AuthTrustLine } from '@/components/rentalWizard/authorization/AuthTrustLine';
import { AuthUpNextPreview } from '@/components/rentalWizard/authorization/AuthUpNextPreview';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import {
  wizardContentGutterStyle,
  wizardLayout,
  wizardScreenBleedStyle,
  wizardScrollBottomPadding,
} from '@/constants/wizardLayout';
import { ui } from '@/constants/appUi';
import type { RentalWizardContext, RentalWizardStep } from '@/lib/rentalWizard/types';

export type AuthPremiumShellProps = {
  ctx: RentalWizardContext;
  activeStep: RentalWizardStep;
  onBack: () => void;
  onOpenMessages?: () => void;
  focalTitle: string;
  focalSubtitle: string;
  trustMessage?: string;
  upNextLabel?: string;
  upNextBody?: string;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  primaryBusy?: boolean;
  primaryShowArrow?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
  footerNote?: string;
  children?: React.ReactNode;
  bodyStyle?: StyleProp<ViewStyle>;
};

export function AuthPremiumShell({
  ctx,
  activeStep,
  onBack,
  onOpenMessages,
  focalTitle,
  focalSubtitle,
  trustMessage,
  upNextLabel,
  upNextBody,
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  primaryBusy = false,
  primaryShowArrow = true,
  secondaryLabel,
  onSecondary,
  footerNote,
  children,
  bodyStyle,
}: AuthPremiumShellProps) {
  const insets = useSafeAreaInsets();
  const heroBg = authPremium.gradient.hero[0];

  return (
    <ScreenWrapper
      style={[styles.screen, wizardScreenBleedStyle, { backgroundColor: heroBg }]}
      innerStyle={styles.screenInner}
      edges={['top', 'left', 'right']}
    >
      <View style={styles.flex}>
        <LinearGradient
          colors={[...authPremium.gradient.hero]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroBand}
        >
          <View style={[styles.heroNav, { paddingTop: Math.max(insets.top, 8) }]}>
            <Pressable
              pressOpacityFeedback={false}
              haptic
              onPress={onBack}
              style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            </Pressable>
            <View style={styles.navSpacer} />
            {onOpenMessages ? (
              <Pressable
                pressOpacityFeedback={false}
                haptic
                onPress={onOpenMessages}
                style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.85 }]}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={22} color="#FFFFFF" />
              </Pressable>
            ) : (
              <View style={styles.navBtn} />
            )}
          </View>

          <View style={styles.heroContent}>
            <AuthorizationProgressHeader ctx={ctx} activeStep={activeStep} variant="onDark" />
            <Text style={authType.heroHeadline}>{focalTitle}</Text>
            <Text style={authType.heroSupport}>{focalSubtitle}</Text>
            {trustMessage ? <AuthTrustLine text={trustMessage} variant="onDark" /> : null}
          </View>
        </LinearGradient>

        <AppKeyboardAwareScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            wizardContentGutterStyle,
            { paddingBottom: wizardScrollBottomPadding(insets.bottom) + 100 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.body, bodyStyle]}>{children}</View>
          {upNextLabel && upNextBody ? (
            <AuthUpNextPreview label={upNextLabel} body={upNextBody} />
          ) : null}
        </AppKeyboardAwareScrollView>

        <View
          style={[
            styles.footer,
            wizardContentGutterStyle,
            { paddingBottom: Math.max(insets.bottom, wizardLayout.footerBottomMin) },
          ]}
        >
          {footerNote ? (
            <View style={styles.footerNoteWrap}>
              <Text style={styles.footerNote}>{footerNote}</Text>
            </View>
          ) : null}
          <AuthGradientButton
            label={primaryLabel}
            onPress={onPrimary}
            disabled={primaryDisabled}
            busy={primaryBusy}
            showArrow={primaryShowArrow && !primaryDisabled}
          />
          {secondaryLabel && onSecondary ? (
            <Pressable
              pressOpacityFeedback={false}
              onPress={onSecondary}
              style={styles.secondaryBtn}
            >
              <Text style={styles.secondaryText}>{secondaryLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenInner: { flex: 1 },
  flex: { flex: 1, backgroundColor: ui.background },
  heroBand: {
    paddingBottom: 22,
    borderBottomLeftRadius: authPremium.radius.hero,
    borderBottomRightRadius: authPremium.radius.hero,
    overflow: 'hidden',
  },
  heroNav: {
    flexDirection: 'row',
    alignItems: 'center',
    ...wizardContentGutterStyle,
    minHeight: 44,
  },
  navBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navSpacer: { flex: 1 },
  heroContent: {
    ...wizardContentGutterStyle,
    gap: 12,
    alignItems: 'center',
  },
  scroll: { flex: 1, backgroundColor: ui.background },
  scrollContent: {
    paddingTop: wizardLayout.scrollPaddingTop,
  },
  body: {
    gap: authPremium.spacing.block,
    alignSelf: 'stretch',
  },
  footer: {
    paddingTop: wizardLayout.footerPaddingTop,
    gap: wizardLayout.footerGap,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ui.border,
    backgroundColor: ui.background,
  },
  footerNoteWrap: {
    backgroundColor: ui.surfaceTintPrimary,
    borderRadius: wizardLayout.footerNoteRadius,
    paddingVertical: wizardLayout.footerNotePaddingVertical,
    paddingHorizontal: wizardLayout.footerNotePaddingHorizontal,
  },
  footerNote: {
    fontSize: 13,
    fontWeight: '600',
    color: ui.primary,
    textAlign: 'center',
    lineHeight: 18,
  },
  secondaryBtn: {
    alignItems: 'center',
    paddingVertical: wizardLayout.secondaryPaddingVertical,
  },
  secondaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: ui.primary,
  },
});
