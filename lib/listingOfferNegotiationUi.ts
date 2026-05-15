import { NEGOTIATION_MAX_DECLINES_BEFORE_LOCK } from '@/lib/negotiationLifecycleConstants';
import { MAX_POSTER_COUNTER_OFFERS } from '@/lib/negotiationOfferConstants';
import type { ListingOfferActivityRow } from '@/store/listingOffersActivityStore';

/** Host can accept / counter / decline only after the renter’s latest move. */
export function listingOfferOwnerCanRespond(row: ListingOfferActivityRow): boolean {
  if (row.negotiationLocked) return false;
  if (row.status !== 'pending') return false;
  return row.lastUpdatedBy.trim() === row.renterUserId.trim();
}

export function listingOfferRemainingOwnerCounters(row: ListingOfferActivityRow): number {
  return Math.max(0, MAX_POSTER_COUNTER_OFFERS - row.posterCounterCount);
}

export function listingOfferRemainingDeclinesBeforeLock(row: ListingOfferActivityRow): number {
  return Math.max(0, NEGOTIATION_MAX_DECLINES_BEFORE_LOCK - row.negotiationDeclineTotal);
}
