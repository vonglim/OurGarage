import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppKeyboardAwareScrollView } from '@/components/AppKeyboardAwareScrollView';
import { BackHeader } from '@/components/AppHeaders';
import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';

import { REQ_PROGRESS_GREEN } from './requestConstants';
import { RequestSegmentedProgressBar } from './RequestSegmentedProgressBar';

type Props = {
  title?: string;
  subtitle?: string;
  stepIndex: number;
  totalSteps?: number;
  reviewMode?: boolean;
  scrollViewRef?: React.RefObject<import('react-native').ScrollView | null>;
  onBack: () => void;
  footerLabel?: string;
  footerDisabled?: boolean;
  onFooterPress: () => void;
  children: React.ReactNode;
  scrollStyle?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

export function RequestWizardChrome({
  title = 'Request an Item',
  subtitle = 'Tell owners what you need and when.',
  stepIndex,
  totalSteps = 5,
  reviewMode = false,
  scrollViewRef,
  onBack,
  footerLabel = 'Continue',
  footerDisabled = false,
  onFooterPress,
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
              {reviewMode ? 'Review your request' : `Step ${stepIndex} of ${totalSteps}`}
            </Text>
            <RequestSegmentedProgressBar filledSegments={filledSegments} />
          </View>
        ) : null}
      </View>

      <AppKeyboardAwareScrollView
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
        bottomOffset={56}
        extraKeyboardSpace={12}
      >
        {children}
      </AppKeyboardAwareScrollView>

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
      </View>
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
    color: REQ_PROGRESS_GREEN,
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
});
