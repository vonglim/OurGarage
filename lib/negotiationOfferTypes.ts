import type { NegotiationDeliveryMethod } from '@/lib/negotiationDelivery';

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
  | 'proposal_declined'
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
  /** From Supabase `offers.offer_images` when present. */
  offer_images?: string[];
  messageHistory: OfferMessageEntry[];
  /** Populated from Supabase `select (..., profiles (id, name))` when the embed succeeds. */
  profiles?: { id: string; name: string } | null;
  offerUserName?: string;
  offerUserRating?: number;
  /** When synced from server; 0 = no public reviews yet (hide rating row in compare). */
  offerUserRatingCount?: number | null;
  offerUserAvatar?: string;
  offerUserLastActive?: number;
  /** Owner declines on this renter+request row; at 3, negotiation locks. */
  negotiationDeclineTotal?: number;
  /** Completed renter withdraws; at 2, no further threads. */
  withdrawCycleCount?: number;
  /** When the renter last withdrew (ms); drives re-offer cooldown. */
  lastWithdrawalAt?: number;
  /** No new offers/counters for this renter on this request. */
  negotiationLocked?: boolean;
  /** Latest negotiation write kind (mirrors `offers.last_negotiation_event_kind`). */
  lastNegotiationEventKind?: string;
  /** Mirrored from `offers.negotiation_delivery_method` when synced. */
  negotiationDeliveryMethod?: NegotiationDeliveryMethod;
  /** Mirrored from `offers.negotiation_delivery_fee` when synced (owner delivery only). */
  negotiationDeliveryFee?: number | null;
};
