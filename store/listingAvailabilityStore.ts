import { create } from 'zustand';

import { fetchListingAvailability, type ListingAvailabilityRow } from '@/lib/listingAvailability';

type LoadState = 'idle' | 'loading' | 'error';

type ListingAvailabilityState = {
  byListingId: Record<string, ListingAvailabilityRow[]>;
  loadByListingId: Record<string, LoadState>;
  setListingRows: (listingId: string, rows: ListingAvailabilityRow[], load?: LoadState) => void;
  patchListingRowsOptimistic: (
    listingId: string,
    mutator: (prev: ListingAvailabilityRow[]) => ListingAvailabilityRow[]
  ) => void;
};

export const useListingAvailabilityStore = create<ListingAvailabilityState>((set) => ({
  byListingId: {},
  loadByListingId: {},
  setListingRows: (listingId, rows, load = 'idle') =>
    set((s) => ({
      byListingId: { ...s.byListingId, [listingId]: rows },
      loadByListingId: { ...s.loadByListingId, [listingId]: load },
    })),
  patchListingRowsOptimistic: (listingId, mutator) =>
    set((s) => {
      const prev = s.byListingId[listingId] ?? [];
      return {
        byListingId: { ...s.byListingId, [listingId]: mutator(prev) },
      };
    }),
}));

export async function hydrateListingAvailability(listingId: string): Promise<{
  ok: boolean;
  rows: ListingAvailabilityRow[];
  message?: string;
}> {
  const id = listingId.trim();
  if (!id) return { ok: false, rows: [], message: 'Missing listing.' };
  const store = useListingAvailabilityStore.getState();
  store.setListingRows(id, store.byListingId[id] ?? [], 'loading');
  const res = await fetchListingAvailability(id);
  if (!res.ok) {
    store.setListingRows(id, [], 'error');
    return res;
  }
  store.setListingRows(id, res.rows, 'idle');
  return { ok: true, rows: res.rows };
}
