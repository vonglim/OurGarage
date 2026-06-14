import { create } from 'zustand';

import {
  fetchPendingRentalRequestsForOwner,
  type PendingListingRentalRow,
} from '@/lib/fetchPendingRentalRequestsForOwner';

type State = {
  rows: PendingListingRentalRow[];
  refreshFromServer: (ownerUserId: string) => Promise<void>;
  setRows: (rows: PendingListingRentalRow[]) => void;
};

export const usePendingRentalRequestsActivityStore = create<State>((set) => ({
  rows: [],
  setRows: (rows) => set({ rows }),
  refreshFromServer: async (ownerUserId) => {
    const uid = ownerUserId.trim();
    if (!uid) {
      set({ rows: [] });
      return;
    }
    const rows = await fetchPendingRentalRequestsForOwner(uid);
    set({ rows });
  },
}));
