import React from 'react';
import { StyleSheet } from 'react-native';

import { RentalAgreementReviewContent } from '@/components/rentalWizard/RentalAgreementReviewContent';
import { RentalAgreementSummaryCard } from '@/components/rentalWizard/RentalAgreementSummaryCard';
import { WizardFormSheet } from '@/components/wizard/WizardFormSheet';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';

export type RentalAgreementReviewSheetProps = {
  visible: boolean;
  ctx: RentalWizardContext;
  onClose: () => void;
};

export function RentalAgreementReviewSheet({ visible, ctx, onClose }: RentalAgreementReviewSheetProps) {
  return (
    <WizardFormSheet
      visible={visible}
      title="Rental Agreement"
      onClose={onClose}
      hideCancelButton
      sheetStyle={styles.sheet}
    >
      <RentalAgreementSummaryCard ctx={ctx} />

      <RentalAgreementReviewContent
        ctx={ctx}
        showTrustBanner={false}
        personalizeReturnSummary={false}
      />
    </WizardFormSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    minHeight: '88%',
  },
});
