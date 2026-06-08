import React from 'react';

import { WizardCancellationBanner } from '@/components/rentalCancellation/WizardCancellationBanner';
import { useGuidedRentalWizardBindings } from '@/components/rentalWizard/GuidedRentalWizardBindingsContext';

/** Inline banner for guided rental wizard steps (renter or owner). */
export function WizardCancellationBannerSlot() {
  const bindings = useGuidedRentalWizardBindings();
  if (!bindings) return null;
  return (
    <WizardCancellationBanner
      ctx={bindings.ctx}
      onRefresh={bindings.refresh}
      onOpenMessages={bindings.openMessages}
    />
  );
}
