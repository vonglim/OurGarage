import {
  bucketOwnerPickupPhotos,
  type OwnerPickupBuckets,
  type PickupPhotoCategory,
  type PickupPhotoLike,
} from '@/lib/pickupVerificationPhotoBuckets';

/** UI categories for renter return uploads (stored on `pickup_photo_category`). */
export type ReturnPhotoCategory = 'item' | 'damage' | 'additional';

export function normalizeReturnPhotoCategory(raw: string | null | undefined): ReturnPhotoCategory | null {
  if (raw == null || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (s === 'item' || s === 'additional') return s;
  /** `serial` on return-phase rows = damage / issue photos (reuses existing DB check). */
  if (s === 'serial') return 'damage';
  return null;
}

export function returnCategoryToStorage(category: ReturnPhotoCategory): PickupPhotoCategory {
  if (category === 'damage') return 'serial';
  return category;
}

export type RenterReturnBuckets<T> = {
  item: T[];
  damage: T[];
  additional: T[];
};

export function bucketRenterReturnPhotos<T extends PickupPhotoLike>(renterReturn: T[]): RenterReturnBuckets<T> {
  const mapped = renterReturn.map((p) => ({
    ...p,
    pickupPhotoCategory: (() => {
      const stored = p.pickupPhotoCategory ?? null;
      if (stored === 'serial') return 'serial' as PickupPhotoCategory;
      if (stored === 'item' || stored === 'additional') return stored;
      return null;
    })(),
  }));
  const b: OwnerPickupBuckets<T> = bucketOwnerPickupPhotos(mapped);
  return {
    item: b.item,
    damage: b.serial,
    additional: b.additional,
  };
}

export function storageCategoryFromReturnTile(category: ReturnPhotoCategory): PickupPhotoCategory {
  return returnCategoryToStorage(category);
}
