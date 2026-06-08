import { useCallback } from 'react';

import { useCoordinationLiveBanner } from '@/components/rentalWizard/CoordinationLiveBannerContext';

export function useCoordinateProposalReviewUi() {
  const liveBanner = useCoordinationLiveBanner();

  const dismissBanner = useCallback(() => {
    liveBanner?.dismissBanner();
  }, [liveBanner]);

  return { dismissBanner };
}
