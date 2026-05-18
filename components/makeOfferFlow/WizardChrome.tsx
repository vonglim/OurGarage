import React from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import { KeyboardToolbar } from 'react-native-keyboard-controller';

import { GuidedWizardChrome, WizardHeaderProgress } from '@/components/wizard/GuidedWizardChrome';
import { MAO_PROGRESS_GREEN } from './constants';
import { SegmentedProgressBar } from './SegmentedProgressBar';

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
  secondaryFooterLabel?: string;
  onSecondaryFooterPress?: () => void;
  children: React.ReactNode;
  scrollStyle?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

/**
 * Make-an-offer wizard chrome — uses shared {@link GuidedWizardChrome}.
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
  const showProgress = reviewMode || (stepIndex >= 1 && stepIndex <= totalSteps);
  const filledSegments = reviewMode ? totalSteps : Math.min(stepIndex, totalSteps);

  return (
    <>
      <GuidedWizardChrome
        title={title}
        subtitle={subtitle}
        onBack={onBack}
        scrollViewRef={scrollViewRef}
        footerLabel={footerLabel}
        footerDisabled={footerDisabled}
        onFooterPress={onFooterPress}
        secondaryFooterLabel={secondaryFooterLabel}
        onSecondaryFooterPress={onSecondaryFooterPress}
        scrollStyle={scrollStyle}
        contentContainerStyle={contentContainerStyle}
        headerExtra={
          showProgress ? (
            <WizardHeaderProgress
              label={reviewMode ? 'Review your offer' : `Step ${stepIndex} of ${totalSteps}`}
              labelColor={MAO_PROGRESS_GREEN}
              bar={<SegmentedProgressBar filledSegments={filledSegments} totalSegments={totalSteps} />}
            />
          ) : null
        }
      >
        {children}
      </GuidedWizardChrome>
      {Platform.OS !== 'web' ? <KeyboardToolbar showArrows={false} /> : null}
    </>
  );
}
