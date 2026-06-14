import {
  bucketOwnerPickupPhotos,
  OWNER_PICKUP_REQUIRED_ITEM_MIN,
  OWNER_PICKUP_REQUIRED_SERIAL_MIN,
  OWNER_PICKUP_REQUIRED_TIMESTAMP_MIN,
  type PickupPhotoLike,
} from '@/lib/pickupVerificationPhotoBuckets';
import {
  CURRENT_CONDITION_PHOTOS_LABEL,
  TIMESTAMP_POSSESSION_PROOF_TILE_LABEL,
} from '@/lib/timestampPossessionProofCopy';

export const OWNER_PICKUP_PREP_MANUAL_ITEM_ID = 'op-accessories';

export const OWNER_PICKUP_PREP_CHECKLIST = [
  {
    id: 'prep-photos',
    label: 'Upload pickup evidence photos',
    detail: `${CURRENT_CONDITION_PHOTOS_LABEL}, serial, and ${TIMESTAMP_POSSESSION_PROOF_TILE_LABEL.toLowerCase()}`,
  },
  {
    id: OWNER_PICKUP_PREP_MANUAL_ITEM_ID,
    label: 'Confirm accessories included',
    detail: 'Verify all included parts are present',
    manual: true as const,
  },
  {
    id: 'prep-item-ready',
    label: 'Prepare the item',
    detail: 'Charge batteries, clean, and gather accessories',
    manual: true as const,
  },
  {
    id: 'prep-meetup',
    label: 'Confirm meetup details',
    detail: 'Pickup location and handoff time are set',
  },
] as const;

export function buildOwnerPickupPrepChecklistDone(input: {
  ownerPickupPhotos: readonly PickupPhotoLike[];
  storedManual: Record<string, boolean>;
  meetupDetailsConfirmed: boolean;
  itemReadyConfirmed: boolean;
}): Record<string, boolean> {
  const buckets = bucketOwnerPickupPhotos([...input.ownerPickupPhotos]);
  const photosComplete =
    buckets.item.length >= OWNER_PICKUP_REQUIRED_ITEM_MIN &&
    buckets.serial.length >= OWNER_PICKUP_REQUIRED_SERIAL_MIN &&
    buckets.timestampProof.length >= OWNER_PICKUP_REQUIRED_TIMESTAMP_MIN;

  return {
    'prep-photos': photosComplete,
    [OWNER_PICKUP_PREP_MANUAL_ITEM_ID]: Boolean(input.storedManual[OWNER_PICKUP_PREP_MANUAL_ITEM_ID]),
    'prep-item-ready': input.itemReadyConfirmed,
    'prep-meetup': input.meetupDetailsConfirmed,
  };
}

export function isOwnerPickupPrepChecklistComplete(done: Record<string, boolean>): boolean {
  return OWNER_PICKUP_PREP_CHECKLIST.every((item) => Boolean(done[item.id]));
}
