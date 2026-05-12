import React from 'react';

import { SegmentedProgressBar } from '@/components/makeOfferFlow/SegmentedProgressBar';

import { TOTAL_LISTING_WIZARD_STEPS } from './listingConstants';

type Props = {
  filledSegments: number;
};

export function ListingSegmentedProgressBar({ filledSegments }: Props) {
  return (
    <SegmentedProgressBar
      filledSegments={filledSegments}
      totalSegments={TOTAL_LISTING_WIZARD_STEPS}
    />
  );
}
