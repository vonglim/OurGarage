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
} from '@/constants/wizardLayout';

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
  children,
  scrollStyle,
  contentContainerStyle,
  bodyStyle,
}: GuidedWizardChromeProps) {
  const insets = useSafeAreaInsets();

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
          { paddingBottom: wizardScrollBottomPadding(insets.bottom) },
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

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, wizardLayout.footerBottomMin) }]}>
        {footerNote ? <Text style={styles.footerNote}>{footerNote}</Text> : null}
        <Pressable
          onPress={onFooterPress}
          disabled={footerDisabled}
          style={({ pressed }) => [
            styles.cta,
            publishCta && styles.ctaPublish,
            footerDisabled && styles.ctaDisabled,
            pressed && !footerDisabled && { opacity: 0.92 },
          ]}
          pressOpacityFeedback={false}
        >
          <Text style={[styles.ctaText, publishCta && styles.ctaTextPublish]}>{footerLabel}</Text>
        </Pressable>
        {secondaryFooterLabel && onSecondaryFooterPress ? (
          <Pressable
            onPress={onSecondaryFooterPress}
            style={({ pressed }) => [styles.secondaryFooter, pressed && { opacity: 0.85 }]}
            pressOpacityFeedback={false}
          >
            <Text style={styles.secondaryFooterText}>{secondaryFooterLabel}</Text>
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
