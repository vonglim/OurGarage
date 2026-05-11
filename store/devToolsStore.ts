import { create } from 'zustand';

import type { RentalLifecyclePhase } from '@/lib/rentalLifecyclePhase';

type PageAutofill = (() => void) | null;

type DevToolsState = {
  pageAutofill: PageAutofill;
  pageLabel: string | null;
  /** When set (dev only), rental screen uses this instead of DB-derived phase for UI experiments. */
  rentalLifecycleOverride: RentalLifecyclePhase | null;
  setPageAutofill: (handler: PageAutofill, label?: string | null) => void;
  setRentalLifecycleOverride: (phase: RentalLifecyclePhase | null) => void;
  clearRentalLifecycleOverride: () => void;
  reset: () => void;
};

export const useDevToolsStore = create<DevToolsState>((set) => ({
  pageAutofill: null,
  pageLabel: null,
  rentalLifecycleOverride: null,
  setPageAutofill: (handler, label = null) =>
    set({
      pageAutofill: handler,
      pageLabel: label,
    }),
  setRentalLifecycleOverride: (phase) => set({ rentalLifecycleOverride: phase }),
  clearRentalLifecycleOverride: () => set({ rentalLifecycleOverride: null }),
  reset: () =>
    set({
      pageAutofill: null,
      pageLabel: null,
      rentalLifecycleOverride: null,
    }),
}));
