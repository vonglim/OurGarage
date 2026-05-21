import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppKeyboardAwareScrollView } from '@/components/AppKeyboardAwareScrollView';
import { BackHeader } from '@/components/AppHeaders';
import { Pressable } from '@/components/Pressable';
import {
  guidedWizardChromeStyles as styles,
  wizardLayout,
  wizardScrollBottomPadding,
  wizardScrollBottomPaddingCompact,
} from '@/constants/wizardLayout';

export type WizardFooterInlineAction = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  emphasis?: 'secondary' | 'tertiary';
};

export type GuidedWizardChromeProps = {
  title: string;
  subtitle?: string;
  onBack: () => void;
  rightAccessory?: React.ReactNode;
  /** Slot below header (progress bar, step label, etc.). */
  headerExtra?: React.ReactNode;
  scrollViewRef?: React.RefObject<import('react-native').ScrollView | null>;
  footerLabel?: string;
  footerDisabled?: boolean;
  onFooterPress: () => void;
  /** Optional banner above primary CTA (rental propose notice, etc.). */
  footerNote?: string;
  /** Green publish-style primary (listing review). */
  publishCta?: boolean;
  secondaryFooterLabel?: string;
  onSecondaryFooterPress?: () => void;
  secondaryFooterDisabled?: boolean;
  tertiaryFooterLabel?: string;
  onTertiaryFooterPress?: () => void;
  /** Compact inline row beneath primary CTA (e.g. "Suggest changes · Open messages"). */
  footerInlineActions?: WizardFooterInlineAction[];
  /** Lighter sticky footer — reduced padding and scroll reserve. */
  footerCompact?: boolean;
  children: React.ReactNode;
  scrollStyle?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  bodyStyle?: StyleProp<ViewStyle>;
};

/**
 * Shared chrome for guided multi-step flows (Request, Listing, Offer, Rental).
 * Must be rendered inside `ScreenWrapper` — horizontal padding comes from the screen shell.
 */
export function GuidedWizardChrome({
  title,
  subtitle,
  onBack,
  rightAccessory,
  headerExtra,
  scrollViewRef,
  footerLabel = 'Continue',
  footerDisabled = false,
  onFooterPress,
  footerNote,
  publishCta = false,
  secondaryFooterLabel,
  onSecondaryFooterPress,
  secondaryFooterDisabled = false,
  tertiaryFooterLabel,
  onTertiaryFooterPress,
  footerInlineActions,
  footerCompact = false,
  children,
  scrollStyle,
  contentContainerStyle,
  bodyStyle,
}: GuidedWizardChromeProps) {
  const insets = useSafeAreaInsets();
  const scrollBottomPad = footerCompact
    ? wizardScrollBottomPaddingCompact(insets.bottom)
    : wizardScrollBottomPadding(insets.bottom);
  const footerBottomPad = footerCompact
    ? Math.max(insets.bottom, wizardLayout.footerCompactBottomMin)
    : Math.max(insets.bottom, wizardLayout.footerBottomMin);

  return (
    <View style={styles.flex}>
      <View style={styles.headerBlock}>
        <BackHeader
          title={title}
          subtitle={subtitle}
          onBack={onBack}
          rightAccessory={rightAccessory}
        />
        {headerExtra}
      </View>

      <AppKeyboardAwareScrollView
        ref={scrollViewRef}
        style={[styles.scroll, scrollStyle]}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: scrollBottomPad },
          contentContainerStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        bottomOffset={wizardLayout.keyboardBottomOffset}
        extraKeyboardSpace={wizardLayout.keyboardExtraSpace}
      >
        <View style={[styles.body, bodyStyle]}>{children}</View>
      </AppKeyboardAwareScrollView>

      <View
        style={[
          styles.footer,
          footerCompact && styles.footerCompact,
          { paddingBottom: footerBottomPad },
        ]}
      >
        {footerNote ? <Text style={styles.footerNote}>{footerNote}</Text> : null}
        <Pressable
          onPress={onFooterPress}
          disabled={footerDisabled}
          style={({ pressed }) => [
            styles.cta,
            footerCompact && styles.ctaCompact,
            publishCta && styles.ctaPublish,
            footerDisabled && styles.ctaDisabled,
            pressed && !footerDisabled && { opacity: 0.92 },
          ]}
          pressOpacityFeedback={false}
        >
          <Text style={[styles.ctaText, publishCta && styles.ctaTextPublish]}>{footerLabel}</Text>
        </Pressable>
        {footerInlineActions && footerInlineActions.length > 0 ? (
          <View style={styles.inlineFooterActions}>
            {footerInlineActions.map((action, index) => (
              <React.Fragment key={`${action.label}-${index}`}>
                {index > 0 ? <Text style={styles.inlineFooterSep}>·</Text> : null}
                <Pressable
                  onPress={action.onPress}
                  disabled={action.disabled}
                  style={({ pressed }) => [pressed && !action.disabled && { opacity: 0.85 }]}
                  pressOpacityFeedback={false}
                >
                  <Text
                    style={[
                      styles.inlineFooterAction,
                      action.emphasis === 'tertiary' && styles.inlineFooterActionTertiary,
                      action.disabled && styles.ctaDisabled,
                    ]}
                  >
                    {action.label}
                  </Text>
                </Pressable>
              </React.Fragment>
            ))}
          </View>
        ) : null}
        {!footerInlineActions?.length && secondaryFooterLabel && onSecondaryFooterPress ? (
          <Pressable
            onPress={onSecondaryFooterPress}
            disabled={secondaryFooterDisabled}
            style={({ pressed }) => [
              styles.secondaryFooter,
              secondaryFooterDisabled && styles.ctaDisabled,
              pressed && !secondaryFooterDisabled && { opacity: 0.85 },
            ]}
            pressOpacityFeedback={false}
          >
            <Text style={styles.secondaryFooterText}>{secondaryFooterLabel}</Text>
          </Pressable>
        ) : null}
        {!footerInlineActions?.length && tertiaryFooterLabel && onTertiaryFooterPress ? (
          <Pressable
            onPress={onTertiaryFooterPress}
            style={({ pressed }) => [styles.tertiaryFooter, pressed && { opacity: 0.85 }]}
            pressOpacityFeedback={false}
          >
            <Text style={styles.tertiaryFooterText}>{tertiaryFooterLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function WizardHeaderProgress({
  label,
  bar,
  labelColor,
}: {
  label: string;
  bar: React.ReactNode;
  labelColor?: string;
}) {
  return (
    <View style={progressStyles.wrap}>
      <Text style={[progressStyles.label, labelColor != null ? { color: labelColor } : null]}>{label}</Text>
      {bar}
    </View>
  );
}

const progressStyles = StyleSheet.create({
  wrap: {
    marginTop: wizardLayout.progressMarginTop,
    gap: wizardLayout.progressGap,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
