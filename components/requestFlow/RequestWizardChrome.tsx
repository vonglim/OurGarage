import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';

import { GuidedWizardChrome, WizardHeaderProgress } from '@/components/wizard/GuidedWizardChrome';
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
  const showProgress = reviewMode || (stepIndex >= 1 && stepIndex <= totalSteps);
  const filledSegments = reviewMode ? totalSteps : Math.min(stepIndex, totalSteps);

  return (
    <GuidedWizardChrome
      title={title}
      subtitle={subtitle}
      onBack={onBack}
      scrollViewRef={scrollViewRef}
      footerLabel={footerLabel}
      footerDisabled={footerDisabled}
      onFooterPress={onFooterPress}
      scrollStyle={scrollStyle}
      contentContainerStyle={contentContainerStyle}
      headerExtra={
        showProgress ? (
          <WizardHeaderProgress
            label={reviewMode ? 'Review your request' : `Step ${stepIndex} of ${totalSteps}`}
            labelColor={REQ_PROGRESS_GREEN}
            bar={<RequestSegmentedProgressBar filledSegments={filledSegments} />}
          />
        ) : null
      }
    >
      {children}
    </GuidedWizardChrome>
  );
}
