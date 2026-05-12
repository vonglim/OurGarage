import type { ToolListing } from '@/store/listingsStore';

/**
 * Persisted on `rental_requests.listing_snapshot` and `offers.listing_snapshot`
 * so terms stay interpretable if the listing is edited later.
 */
export type ListingIntentSnapshot = {
  listing_id: string;
  title: string;
  hero_image_url: string | null;
  daily_price: number;
  price_unit: string | null;
  condition_label: string | null;
  /** True when listing advertises owner delivery / meet+deliver style handoff. */
  delivery_available: boolean | null;
  handoff_summary: string | null;
  service_area: string | null;
  replacement_value: number | null;
};

export function buildListingIntentSnapshot(
  listing: ToolListing,
  normalizedImageUrls: string[]
): ListingIntentSnapshot {
  const hero = normalizedImageUrls.map((u) => u.trim()).filter(Boolean)[0] ?? null;
  const meta = listing.meta;
  const handoff = meta?.handoffSummary?.trim() ?? null;
  const deliveryGuess =
    handoff != null
      ? /\bdeliver/i.test(handoff) || /\bmeet/i.test(handoff) || /\bring/i.test(handoff)
      : null;

  return {
    listing_id: listing.id,
    title: listing.name?.trim() || 'Listing',
    hero_image_url: hero,
    daily_price: Number.isFinite(listing.price) ? listing.price : 0,
    price_unit: listing.priceUnit?.trim() ?? 'day',
    condition_label: meta?.conditionLabel?.trim() ?? null,
    delivery_available: deliveryGuess,
    handoff_summary: handoff,
    service_area: meta?.serviceArea?.trim() ?? null,
    replacement_value:
      meta?.marketValue != null && Number.isFinite(meta.marketValue) ? meta.marketValue : listing.replacementValue ?? null,
  };
}
