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
  /** Supabase `weekly_price`. */
  weeklyPrice?: number;
  replacementValue?: number;
  dailyLateFee?: number;
  maxLateFeeCap?: number;
  /** Cover / gallery URLs from Supabase `images` when present. */
  images?: string[];
  /** Miles (display). */
  distance: number;
  createdAt: number;
  /** Supabase `listing_status`: active | paused | draft | archived */
  listingStatus?: string;
  /** Optional storefront fields from Listing Wizard (until dedicated API). */
  meta?: ToolListingMeta;
};

export type ToolListingMeta = {
  conditionLabel?: string;
  includedItems?: string[];
  handoffSummary?: string;
  serviceArea?: string;
  marketValue?: number;
  verificationStatus?: string;
  photoCount?: number;
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
