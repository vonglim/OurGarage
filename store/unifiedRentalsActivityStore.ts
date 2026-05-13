import { create } from 'zustand';

import { getAuthUserIdSync } from '@/lib/authUser';
import {
  fetchUnifiedRentalsForUser,
  type UnifiedRentalRow,
} from '@/lib/fetchUnifiedRentalsForUser';

type State = {
  rows: UnifiedRentalRow[];
  /** Load `rentals` rows where the signed-in user is renter or owner (Activity / home). */
  refreshFromServer: () => Promise<void>;
  reset: () => void;
};

let refreshInFlight: Promise<void> | null = null;

export const useUnifiedRentalsActivityStore = create<State>((set) => ({
  rows: [],
  reset: () => set({ rows: [] }),
  refreshFromServer: async () => {
    if (refreshInFlight) return refreshInFlight;
    const uid = getAuthUserIdSync()?.trim();
    if (!uid) {
      set({ rows: [] });
      return;
    }
    refreshInFlight = (async () => {
      const rows = await fetchUnifiedRentalsForUser(uid);
      set({ rows });
    })().finally(() => {
      refreshInFlight = null;
    });
    return refreshInFlight;
  },
}));
