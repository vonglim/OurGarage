import { billingDaysInclusive } from '@/lib/listingAvailability';
import type { ToolListing } from '@/store/listingsStore';

/** Same keys as listing detail duration picker (`app/listing-detail.tsx`). */
export type ListingDetailDurationKey = 'full' | 'multi';

/**
 * Matches `app/listing-detail.tsx` `priceForDuration`: multi-day picker uses at least 2 billed days;
 * full-day picker uses a single unit at list price.
 */
export function listingDetailPriceForDuration(
  basePrice: number,
  durationKey: ListingDetailDurationKey,
  dayCount: number
): number {
  if (durationKey === 'multi') return basePrice * Math.max(2, dayCount);
  return basePrice;
}

/**
 * Estimated rental total for request / review UIs: uses selected ISO date span and list rates.
 * Per-day listings: multi uses the same multiplier rule as listing detail; full scales by inclusive calendar days.
 * Week-priced listings: whole weeks from span (uses `weeklyPrice` when set, else daily × 7).
 */
export function estimateListingRentalTotalFromCalendar(args: {
  listing: Pick<ToolListing, 'price' | 'priceUnit' | 'weeklyPrice'>;
  rentalStartIso: string | null;
  rentalEndIso: string | null;
  durationKey: ListingDetailDurationKey;
}): number {
  const { listing, rentalStartIso, rentalEndIso, durationKey } = args;
  const start = rentalStartIso?.trim() ?? '';
  const end = rentalEndIso?.trim() ?? '';
  const bd = start && end ? billingDaysInclusive(start, end) : 1;

  const unit = listing.priceUnit?.trim().toLowerCase() ?? 'day';
  if (unit === 'week' || unit === 'weekly') {
    const weekN = Number(listing.weeklyPrice);
    const rate = Number.isFinite(weekN) && weekN > 0 ? weekN : listing.price * 7;
    const weeks = Math.max(1, Math.ceil(bd / 7));
    return Math.round(rate * weeks * 100) / 100;
  }

  if (durationKey === 'multi') {
    return Math.round(listingDetailPriceForDuration(listing.price, 'multi', bd) * 100) / 100;
  }
  return Math.round(listing.price * Math.max(1, bd) * 100) / 100;
}
