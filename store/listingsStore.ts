import { create } from 'zustand';

import { formatUsd } from '@/lib/money';

export type ToolListing = {
  id: string;
  name: string;
  price: number;
  /** e.g. "day", "week"; display defaults to "day" when omitted. */
  priceUnit?: string;
  description?: string;
  /** Set when listing is published from the app (not returned by public listings fetch). */
  ownerUserId?: string;
  ownerName: string;
  rating: number;
  /** Supabase `half_day_price`. */
  halfDayPrice?: number;
  /** Supabase `weekly_price`. */
  weeklyPrice?: number;
  /** Cover / gallery URLs from Supabase `images` when present. */
  images?: string[];
  /** Miles (display). */
  distance: number;
  createdAt: number;
};

type ListingsState = {
  listings: ToolListing[];
  appendListing: (row: ToolListing) => void;
  setListings: (rows: ToolListing[]) => void;
};

export const useListingsStore = create<ListingsState>((set) => ({
  listings: [],

  appendListing: (row) =>
    set((s) => ({
      listings: [...s.listings, row],
    })),

  setListings: (rows) => set({ listings: rows }),
}));

export function getListingById(id: string): ToolListing | undefined {
  return useListingsStore.getState().listings.find((l) => l.id === id);
}

export function formatListingPriceWithUnit(price: number, priceUnit?: string | null): string {
  const unit = priceUnit?.trim() || 'day';
  return `${formatUsd(price)} / ${unit}`;
}

export function clearAllListings(): void {
  useListingsStore.setState({ listings: [] });
}
