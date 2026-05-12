import React from 'react';

import { SegmentedProgressBar } from '@/components/makeOfferFlow/SegmentedProgressBar';

import { TOTAL_REQUEST_WIZARD_STEPS } from './requestConstants';

type Props = {
  filledSegments: number;
};

export function RequestSegmentedProgressBar({ filledSegments }: Props) {
  return (
    <SegmentedProgressBar
      filledSegments={filledSegments}
      totalSegments={TOTAL_REQUEST_WIZARD_STEPS}
    />
  );
}
