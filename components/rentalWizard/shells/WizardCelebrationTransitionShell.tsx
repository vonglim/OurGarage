import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppKeyboardAwareScrollView } from '@/components/AppKeyboardAwareScrollView';
import { Pressable } from '@/components/Pressable';
import { WizardCancellationBannerSlot } from '@/components/rentalCancellation/WizardCancellationBannerSlot';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import {
  guidedWizardChromeStyles,
  wizardCelebrationBodyStyle,
  wizardCelebrationScrollContentStyle,
  wizardLayout,
  wizardScrollBottomPadding,
  wizardScrollBottomPaddingStackedFooter,
} from '@/constants/wizardLayout';
import { ui } from '@/constants/appUi';

export type WizardCelebrationTransitionShellProps = {
  onBack: () => void;
  onOpenMessages?: () => void;
  primaryLabel: string;
  onPrimary: () => void;
  primaryShowArrow?: boolean;
  outlinedSecondaryLabel?: string;
  onOutlinedSecondary?: () => void;
  outlinedSecondaryIcon?: keyof typeof Ionicons.glyphMap;
  tertiaryLabel?: string;
  onTertiary?: () => void;
  children: React.ReactNode;
  bodyStyle?: StyleProp<ViewStyle>;
};

/**
 * Canonical light **celebration transition** shell (rental confirmed, pickup confirmed, all set).
 * See `components/rentalWizard/shells/README.md` for the three wizard shell categories.
 */
export function WizardCelebrationTransitionShell({
  onBack,
  onOpenMessages,
  primaryLabel,
  onPrimary,
  primaryShowArrow = false,
  outlinedSecondaryLabel,
  onOutlinedSecondary,
  outlinedSecondaryIcon = 'chatbubble-outline',
  tertiaryLabel,
  onTertiary,
  children,
  bodyStyle,
}: WizardCelebrationTransitionShellProps) {
  const insets = useSafeAreaInsets();
  const stackedFooter = Boolean(outlinedSecondaryLabel && tertiaryLabel);

  return (
    <ScreenWrapper style={styles.screen} innerStyle={styles.screenInner}>
      <View style={guidedWizardChromeStyles.flex}>
        <View style={guidedWizardChromeStyles.celebrationHeaderBlock}>
          <View style={styles.minimalHeader}>
            <Pressable
              pressOpacityFeedback={false}
              haptic
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={onBack}
              style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="chevron-back" size={22} color={ui.textPrimary} />
            </Pressable>
            <View style={styles.headerSpacer} />
            {onOpenMessages ? (
              <Pressable
                pressOpacityFeedback={false}
                haptic
                onPress={onOpenMessages}
                accessibilityLabel="Open messages"
                style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.85 }]}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={22} color={ui.primary} />
              </Pressable>
            ) : (
              <View style={styles.headerBtn} />
            )}
          </View>
        </View>

        <AppKeyboardAwareScrollView
          style={guidedWizardChromeStyles.scroll}
          contentContainerStyle={[
            wizardCelebrationScrollContentStyle,
            {
              paddingBottom: stackedFooter
                ? wizardScrollBottomPaddingStackedFooter(insets.bottom)
                : wizardScrollBottomPadding(insets.bottom),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          bottomOffset={wizardLayout.keyboardBottomOffset}
          extraKeyboardSpace={wizardLayout.keyboardExtraSpace}
        >
          <WizardCancellationBannerSlot />
          <View style={[wizardCelebrationBodyStyle, bodyStyle]}>{children}</View>
        </AppKeyboardAwareScrollView>

        <View
          style={[
            guidedWizardChromeStyles.celebrationFooterStack,
            { paddingBottom: Math.max(insets.bottom, wizardLayout.footerBottomMin) },
          ]}
        >
          <Pressable
            onPress={onPrimary}
            style={({ pressed }) => [
              guidedWizardChromeStyles.cta,
              guidedWizardChromeStyles.celebrationCta,
              pressed && { opacity: 0.92 },
            ]}
            pressOpacityFeedback={false}
            haptic
          >
            <View style={styles.primaryInner}>
              <Text style={guidedWizardChromeStyles.ctaText}>{primaryLabel}</Text>
              {primaryShowArrow ? (
                <Ionicons name="arrow-forward" size={18} color={ui.primaryOn} />
              ) : null}
            </View>
          </Pressable>

          {outlinedSecondaryLabel && onOutlinedSecondary ? (
            <Pressable
              onPress={onOutlinedSecondary}
              style={({ pressed }) => [
                guidedWizardChromeStyles.celebrationFooterSecondary,
                pressed && { opacity: 0.92 },
              ]}
              pressOpacityFeedback={false}
            >
              <Ionicons name={outlinedSecondaryIcon} size={18} color={ui.textPrimary} />
              <Text style={guidedWizardChromeStyles.celebrationFooterSecondaryText}>
                {outlinedSecondaryLabel}
              </Text>
            </Pressable>
          ) : null}

          {tertiaryLabel && onTertiary ? (
            <Pressable
              onPress={onTertiary}
              style={({ pressed }) => [
                guidedWizardChromeStyles.celebrationFooterTertiary,
                pressed && { opacity: 0.9 },
              ]}
              pressOpacityFeedback={false}
            >
              <Text style={guidedWizardChromeStyles.celebrationFooterTertiaryText}>
                {tertiaryLabel}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={15}
                color={ui.primary}
                style={styles.tertiaryChevron}
              />
            </Pressable>
          ) : null}
        </View>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.background },
  screenInner: { flex: 1 },
  minimalHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: { flex: 1 },
  primaryInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tertiaryChevron: {
    marginLeft: 2,
    opacity: 0.9,
  },
});
