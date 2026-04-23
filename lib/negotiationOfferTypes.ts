export type NegotiationOfferStatus =
  | 'pending'
  | 'pending_confirmation'
  | 'accepted'
  | 'declined'
  | 'closed';

export type OfferMessageEntryKind =
  | 'initial'
  | 'renter_update'
  | 'poster_counter'
  | 'renter_accepts'
  | 'declined'
  | 'accepted'
  | 'note';

export type OfferMessageEntry = {
  at: number;
  authorId: string;
  price?: number;
  body?: string;
  kind: OfferMessageEntryKind;
};

/** One negotiation thread per (request, renter). */
export type Offer = {
  id: string;
  requestId: number;
  /** Lender / renter user id (Supabase `user_id`). */
  renterId: string;
  currentPrice: number;
  /** Mirrors `currentPrice` for `getNumericOfferPrice` compatibility. */
  price?: number;
  lastUpdatedBy: string;
  status: NegotiationOfferStatus;
  updatedAt: number;
  posterCounterCount: number;
  message?: string;
  toolDescription?: string;
  messageHistory: OfferMessageEntry[];
  offerUserName?: string;
  offerUserRating?: number;
  offerUserAvatar?: string;
  offerUserLastActive?: number;
};
