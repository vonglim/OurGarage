import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';

import { GuidedWizardChrome, WizardHeaderProgress } from '@/components/wizard/GuidedWizardChrome';
import { LISTING_PROGRESS_GREEN, TOTAL_LISTING_WIZARD_STEPS } from './listingConstants';
import { ListingSegmentedProgressBar } from './ListingSegmentedProgressBar';

type Props = {
  title?: string;
  subtitle?: string;
  stepIndex: number;
  totalSteps?: number;
  reviewMode?: boolean;
  publishCta?: boolean;
  scrollViewRef?: React.RefObject<import('react-native').ScrollView | null>;
  onBack: () => void;
  footerLabel?: string;
  footerDisabled?: boolean;
  onFooterPress: () => void;
  children: React.ReactNode;
  scrollStyle?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

export function ListingWizardChrome({
  title = 'Create a Listing',
  subtitle = 'Turn your gear into storefront inventory.',
  stepIndex,
  totalSteps = TOTAL_LISTING_WIZARD_STEPS,
  reviewMode = false,
  publishCta = false,
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
      publishCta={publishCta}
      scrollStyle={scrollStyle}
      contentContainerStyle={contentContainerStyle}
      headerExtra={
        showProgress ? (
          <WizardHeaderProgress
            label={reviewMode ? 'Review your listing' : `Step ${stepIndex} of ${totalSteps}`}
            labelColor={LISTING_PROGRESS_GREEN}
            bar={<ListingSegmentedProgressBar filledSegments={filledSegments} />}
          />
        ) : null
      }
    >
      {children}
    </GuidedWizardChrome>
  );
}
