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

export function parseListingIntentSnapshot(raw: unknown): ListingIntentSnapshot | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const listing_id = typeof o.listing_id === 'string' ? o.listing_id.trim() : '';
  if (!listing_id) return null;
  const titleRaw = typeof o.title === 'string' ? o.title.trim() : '';
  const title = titleRaw.length > 0 ? titleRaw : 'Listing';
  return {
    listing_id,
    title,
    hero_image_url: typeof o.hero_image_url === 'string' ? o.hero_image_url : null,
    daily_price: typeof o.daily_price === 'number' && Number.isFinite(o.daily_price) ? o.daily_price : 0,
    price_unit: typeof o.price_unit === 'string' ? o.price_unit : null,
    condition_label: typeof o.condition_label === 'string' ? o.condition_label : null,
    delivery_available: typeof o.delivery_available === 'boolean' ? o.delivery_available : null,
    handoff_summary: typeof o.handoff_summary === 'string' ? o.handoff_summary : null,
    service_area: typeof o.service_area === 'string' ? o.service_area : null,
    replacement_value:
      typeof o.replacement_value === 'number' && Number.isFinite(o.replacement_value)
        ? o.replacement_value
        : null,
  };
}

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
