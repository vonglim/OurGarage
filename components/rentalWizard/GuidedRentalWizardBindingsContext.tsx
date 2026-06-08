import React, { createContext, useContext } from 'react';

import type { RentalWizardContext } from '@/lib/rentalWizard/types';

/** Shared ctx/refresh/messages surface for UI used by renter and owner guided wizards. */
export type GuidedRentalWizardBindings = {
  ctx: RentalWizardContext;
  refresh: () => Promise<void>;
  openMessages: () => void;
};

const GuidedRentalWizardBindingsContext = createContext<GuidedRentalWizardBindings | null>(null);

export function GuidedRentalWizardBindingsProvider({
  value,
  children,
}: {
  value: GuidedRentalWizardBindings;
  children: React.ReactNode;
}) {
  return (
    <GuidedRentalWizardBindingsContext.Provider value={value}>
      {children}
    </GuidedRentalWizardBindingsContext.Provider>
  );
}

export function useGuidedRentalWizardBindings(): GuidedRentalWizardBindings | null {
  return useContext(GuidedRentalWizardBindingsContext);
}
