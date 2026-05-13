import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { KeyboardToolbar } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/AppHeaders';
import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';

import { MAO_PROGRESS_GREEN } from './constants';
import { SegmentedProgressBar } from './SegmentedProgressBar';

type Props = {
  title?: string;
  subtitle?: string;
  stepIndex: number;
  totalSteps?: number;
  /** When true, progress bar is full and label shows review copy instead of “Step N”. */
  reviewMode?: boolean;
  /** Optional ref to the main scroll view (e.g. Accessories step scroll-into-view). */
  scrollViewRef?: React.RefObject<ScrollView | null>;
  onBack: () => void;
  footerLabel?: string;
  footerDisabled?: boolean;
  onFooterPress: () => void;
  /** Optional text action below the primary CTA (e.g. “Back” on a review step). */
  secondaryFooterLabel?: string;
  onSecondaryFooterPress?: () => void;
  children: React.ReactNode;
  scrollStyle?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

/**
 * Root is always a plain `View` (no `KeyboardAvoidingView`) so the sticky CTA stays
 * pinned to the bottom safe area; the keyboard overlays content + CTA when open.
 */
export function WizardChrome({
  title = 'Make an Offer',
  subtitle,
  stepIndex,
  totalSteps = 7,
  reviewMode = false,
  scrollViewRef,
  onBack,
  footerLabel = 'Continue',
  footerDisabled = false,
  onFooterPress,
  secondaryFooterLabel,
  onSecondaryFooterPress,
  children,
  scrollStyle,
  contentContainerStyle,
}: Props) {
  const insets = useSafeAreaInsets();
  const showProgress = reviewMode || (stepIndex >= 1 && stepIndex <= totalSteps);
  const filledSegments = reviewMode ? totalSteps : Math.min(stepIndex, totalSteps);

  return (
    <View style={styles.flex}>
      <View style={styles.headerBlock}>
        <BackHeader title={title} subtitle={subtitle} onBack={onBack} />
        {showProgress ? (
          <View style={styles.progressWrap}>
            <Text style={styles.stepLabel}>
              {reviewMode ? 'Review your offer' : `Step ${stepIndex} of ${totalSteps}`}
            </Text>
            <SegmentedProgressBar filledSegments={filledSegments} totalSegments={totalSteps} />
          </View>
        ) : null}
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={[styles.scroll, scrollStyle]}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 120 + insets.bottom },
          contentContainerStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable
          onPress={onFooterPress}
          disabled={footerDisabled}
          style={({ pressed }) => [
            styles.cta,
            footerDisabled && styles.ctaDisabled,
            pressed && !footerDisabled && { opacity: 0.92 },
          ]}
          pressOpacityFeedback={false}
        >
          <Text style={styles.ctaText}>{footerLabel}</Text>
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

      {Platform.OS !== 'web' ? <KeyboardToolbar showArrows={false} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: ui.background },
  headerBlock: {
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
  },
  progressWrap: {
    marginTop: 4,
    gap: 8,
  },
  stepLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: MAO_PROGRESS_GREEN,
    letterSpacing: -0.2,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingTop: 20,
    flexGrow: 1,
  },
  footer: {
    paddingHorizontal: 0,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ui.border,
    backgroundColor: ui.background,
  },
  cta: {
    backgroundColor: ui.primary,
    paddingVertical: 16,
    borderRadius: ui.radiusProminent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: {
    opacity: 0.45,
  },
  ctaText: {
    color: ui.primaryOn,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryFooter: {
    marginTop: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryFooterText: {
    fontSize: 16,
    fontWeight: '700',
    color: ui.primary,
  },
});
