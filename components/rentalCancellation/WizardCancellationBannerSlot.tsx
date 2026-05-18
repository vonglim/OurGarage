import React from 'react';

import { WizardCancellationBanner } from '@/components/rentalCancellation/WizardCancellationBanner';
import { useRentalWizard } from '@/components/rentalWizard/RentalWizardProvider';

/** Inline banner for guided rental wizard steps (coordinate, pickup, return, etc.). */
export function WizardCancellationBannerSlot() {
  const { ctx, refresh, openMessages } = useRentalWizard();
  return <WizardCancellationBanner ctx={ctx} onRefresh={refresh} onOpenMessages={openMessages} />;
}
