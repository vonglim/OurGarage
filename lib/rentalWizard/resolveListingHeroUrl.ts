import type { ListingIntentSnapshot } from '@/lib/listingIntentSnapshot';

function firstImageFromSnapshot(raw: unknown): string | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const images = (raw as { images?: unknown }).images;
  if (!Array.isArray(images)) return null;
  for (const item of images) {
    if (typeof item === 'string' && item.trim()) return item.trim();
  }
  return null;
}

/** Hero URL for wizard item cards — matches Activity card fallback order. */
export function resolveListingHeroUrl(
  snapshot: ListingIntentSnapshot | null,
  rawSnapshot?: unknown
): string | null {
  const hero = snapshot?.hero_image_url?.trim();
  if (hero) return hero;
  const fromArray = firstImageFromSnapshot(rawSnapshot ?? snapshot);
  return fromArray;
}
