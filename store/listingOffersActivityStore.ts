import { create } from 'zustand';

import type { NegotiationDeliveryMethod } from '@/lib/negotiationDelivery';
import type { NegotiationOfferStatus } from '@/lib/negotiationOfferTypes';
import type { ListingIntentSnapshot } from '@/lib/listingIntentSnapshot';

export type ListingOfferActivityRow = {
  id: string;
  listingId: string;
  renterUserId: string;
  listingOwnerUserId: string;
  currentPrice: number;
  status: NegotiationOfferStatus;
  updatedAtMs: number;
  negotiationDeliveryMethod: NegotiationDeliveryMethod | null;
  negotiationDeliveryFee: number | null;
  posterCounterCount: number;
  negotiationDeclineTotal: number;
  negotiationLocked: boolean;
  lastUpdatedBy: string;
  lastNegotiationEventKind: string | null;
  snapshot: ListingIntentSnapshot | null;
  renterDisplayName: string;
  rentalStartDate: string | null;
  rentalEndDate: string | null;
  replacementValue: number | null;
  toolDescription: string | null;
  /** Reserved for future trust / ID badges */
  renterRating: number;
};

type State = {
  rows: ListingOfferActivityRow[];
  setRows: (rows: ListingOfferActivityRow[]) => void;
};

export const useListingOffersActivityStore = create<State>((set) => ({
  rows: [],
  setRows: (rows) => set({ rows }),
}));
