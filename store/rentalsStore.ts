import { create } from 'zustand';

import { nextLocalId } from '@/lib/idFactory';

export type RentalRecord = {
  id: string;
  requestId: number;
  offerId: string;
  /** Borrower: request creator (request marketplace). */
  renterId: string;
  /** Equipment owner: offer author / `offers.user_id`. */
  ownerId: string;
  price: number;
  status: 'active';
};

type RentalsState = {
  rentals: RentalRecord[];
};

/**
 * In-app rental rows created when an offer is accepted (in addition to request + offer state).
 */
export const useRentalsStore = create<RentalsState>(() => ({
  rentals: [],
}));

/**
 * After a match is applied from Supabase: one active rental record per accepted match.
 */
export function addRentalForAcceptedOffer(input: {
  requestId: number;
  offerId: string;
  renterId: string;
  ownerId: string;
  price: number;
}): void {
  useRentalsStore.setState((s) => {
    const dup = s.rentals.some(
      (r) => r.requestId === input.requestId && r.offerId === input.offerId
    );
    if (dup) return s;
    const row: RentalRecord = {
      id: nextLocalId('rental'),
      requestId: input.requestId,
      offerId: input.offerId,
      renterId: input.renterId,
      ownerId: input.ownerId,
      price: input.price,
      status: 'active',
    };
    return { rentals: [row, ...s.rentals] };
  });
}

export function getRentalsForRequest(requestId: number): RentalRecord[] {
  return useRentalsStore
    .getState()
    .rentals.filter((r) => r.requestId === requestId);
}
