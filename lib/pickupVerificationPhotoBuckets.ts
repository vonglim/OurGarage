/**
 * Owner pickup evidence is grouped by `pickup_photo_category` on `rental_verification_photos`.
 *
 * New uploads always set category from the tile (item / serial / timestamp_proof / additional) — never from order.
 *
 * Positional (legacy) fallback runs only when every owner pickup photo lacks a category — i.e. rows created before
 * migration 045. If any photo has an explicit category, uncategorized orphans are placed in `additional` only (never
 * re-bucketed by upload order).
 */

export const OWNER_ITEM_PHOTO_TARGET = 4;
export const OWNER_SERIAL_PHOTO_TARGET = 1;
export const OWNER_TIMESTAMP_PROOF_TARGET = 1;

/** Minimum counts required before pickup handoff can proceed (item + serial + timestamp proof). */
export const OWNER_PICKUP_REQUIRED_ITEM_MIN = 1;
export const OWNER_PICKUP_REQUIRED_SERIAL_MIN = 1;
export const OWNER_PICKUP_REQUIRED_TIMESTAMP_MIN = 1;

export type PickupPhotoCategory = 'item' | 'serial' | 'timestamp_proof' | 'additional';

export type PickupPhotoLike = {
  id: string;
  createdAt?: string;
  pickupPhotoCategory?: PickupPhotoCategory | null;
};

export type OwnerPickupBuckets<T> = {
  item: T[];
  serial: T[];
  timestampProof: T[];
  additional: T[];
};

const CATEGORY_SET = new Set<PickupPhotoCategory>(['item', 'serial', 'timestamp_proof', 'additional']);

export function normalizePickupPhotoCategory(raw: string | null | undefined): PickupPhotoCategory | null {
  if (raw == null || typeof raw !== 'string') return null;
  const s = raw.trim() as PickupPhotoCategory;
  return CATEGORY_SET.has(s) ? s : null;
}

function sortByCreated<T extends PickupPhotoLike>(photos: T[]): T[] {
  return [...photos].sort((a, b) => {
    const ta = Date.parse(a.createdAt ?? '') || 0;
    const tb = Date.parse(b.createdAt ?? '') || 0;
    return ta - tb;
  });
}

/** Legacy fallback only — pre-migration 045 rows with no `pickup_photo_category`. */
function partitionLegacyOwnerPickupOrder<T extends PickupPhotoLike>(ownerPickup: T[]): {
  item: T[];
  serial: T | null;
  extras: T[];
} {
  const sorted = sortByCreated(ownerPickup);
  const item = sorted.slice(0, OWNER_ITEM_PHOTO_TARGET);
  const rest = sorted.slice(OWNER_ITEM_PHOTO_TARGET);
  const serial = rest[0] ?? null;
  const extras = rest.slice(1);
  return { item, serial, extras };
}

function hasExplicitPickupCategory(p: PickupPhotoLike): boolean {
  const c = p.pickupPhotoCategory ?? null;
  return c === 'item' || c === 'serial' || c === 'timestamp_proof' || c === 'additional';
}

export function bucketOwnerPickupPhotos<T extends PickupPhotoLike>(ownerPickup: T[]): OwnerPickupBuckets<T> {
  const sorted = sortByCreated(ownerPickup);
  const buckets: OwnerPickupBuckets<T> = { item: [], serial: [], timestampProof: [], additional: [] };
  const uncategorized: T[] = [];
  for (const p of sorted) {
    const c = p.pickupPhotoCategory ?? null;
    if (c === 'item') buckets.item.push(p);
    else if (c === 'serial') buckets.serial.push(p);
    else if (c === 'timestamp_proof') buckets.timestampProof.push(p);
    else if (c === 'additional') buckets.additional.push(p);
    else uncategorized.push(p);
  }
  if (uncategorized.length > 0) {
    const legacyFallbackOnly =
      sorted.length > 0 && sorted.every((p) => !hasExplicitPickupCategory(p));
    if (legacyFallbackOnly) {
      const legacy = partitionLegacyOwnerPickupOrder(uncategorized);
      buckets.item.push(...legacy.item);
      if (legacy.serial) buckets.serial.push(legacy.serial);
      buckets.additional.push(...legacy.extras);
    } else {
      buckets.additional.push(...uncategorized);
    }
  }
  return buckets;
}

/** Owner must have at least one item, serial, and timestamp-proof photo (each explicitly categorized or legacy-filled). */
export function ownerPickupPhotoTargetsMet<T extends PickupPhotoLike>(ownerPickup: T[]): boolean {
  const b = bucketOwnerPickupPhotos(ownerPickup);
  return (
    b.item.length >= OWNER_PICKUP_REQUIRED_ITEM_MIN &&
    b.serial.length >= OWNER_PICKUP_REQUIRED_SERIAL_MIN &&
    b.timestampProof.length >= OWNER_PICKUP_REQUIRED_TIMESTAMP_MIN
  );
}

export function partitionRenterPickupPhotos<T extends PickupPhotoLike>(renterPickup: T[]): {
  verification: T | null;
  extras: T[];
} {
  const sorted = sortByCreated(renterPickup);
  const verification = sorted[0] ?? null;
  const extras = sorted.slice(1);
  return { verification, extras };
}

export function renterPickupVerificationMet<T extends PickupPhotoLike>(renterPickup: T[]): boolean {
  return partitionRenterPickupPhotos(renterPickup).verification != null;
}
