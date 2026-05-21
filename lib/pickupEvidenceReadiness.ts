import { logScenario } from '@/lib/rentalLifecycle/scenarioDevLog';
import type { PickupEvidencePhoto } from '@/lib/pickupEvidenceDisplay';
import { lastOwnerPickupEvidenceUpdateAt } from '@/lib/pickupEvidenceDisplay';
import {
  bucketOwnerPickupPhotos,
  ownerPickupPhotoTargetsMet,
} from '@/lib/pickupVerificationPhotoBuckets';

export type PickupEvidenceReadiness = {
  /** Owner uploaded required item + serial + live possession proof. */
  ownerEvidenceReady: boolean;
  /** Renter can open review (same threshold as ownerEvidenceReady). */
  renterEvidenceReady: boolean;
  evidenceRowCount: number;
  ownerPhotoCount: number;
  lastEvidenceUpdateAt: string | null;
  bucketCounts: {
    item: number;
    serial: number;
    timestampProof: number;
    additional: number;
  };
};

export type RenterPreparePickupStepState =
  | 'waiting_owner'
  | 'ready_for_review'
  | 'review_opened'
  | 'photos_approved';

export function evaluatePickupEvidenceReadiness(
  ownerPickupPhotos: readonly PickupEvidencePhoto[]
): PickupEvidenceReadiness {
  const photos = [...ownerPickupPhotos];
  const buckets = bucketOwnerPickupPhotos(photos);
  const ownerEvidenceReady = ownerPickupPhotoTargetsMet(photos);
  return {
    ownerEvidenceReady,
    renterEvidenceReady: ownerEvidenceReady,
    evidenceRowCount: ownerPickupPhotos.length,
    ownerPhotoCount: ownerPickupPhotos.length,
    lastEvidenceUpdateAt: lastOwnerPickupEvidenceUpdateAt(ownerPickupPhotos),
    bucketCounts: {
      item: buckets.item.length,
      serial: buckets.serial.length,
      timestampProof: buckets.timestampProof.length,
      additional: buckets.additional.length,
    },
  };
}

export function resolveRenterPreparePickupStepState(input: {
  readiness: PickupEvidenceReadiness;
  reviewOpenedAt: string | null | undefined;
  photosApprovedAt: string | null | undefined;
}): RenterPreparePickupStepState {
  if (input.photosApprovedAt?.trim()) return 'photos_approved';
  if (!input.readiness.renterEvidenceReady) return 'waiting_owner';
  if (!input.reviewOpenedAt?.trim()) return 'ready_for_review';
  return 'review_opened';
}

export function logPickupEvidenceRealtime(
  rentalId: string,
  input: {
    triggerSource: string;
    readiness: PickupEvidenceReadiness;
    renterPrepareStepState: RenterPreparePickupStepState;
    reviewOpened: boolean;
  }
): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  logScenario('lifecycle', {
    event: 'pickup_evidence_realtime',
    tag: 'pickup-evidence-realtime',
    rentalId,
    triggerSource: input.triggerSource,
    renterEvidenceReady: input.readiness.renterEvidenceReady,
    ownerEvidenceReady: input.readiness.ownerEvidenceReady,
    evidenceRowCount: input.readiness.evidenceRowCount,
    lastEvidenceUpdateAt: input.readiness.lastEvidenceUpdateAt,
    renterPrepareStepState: input.renterPrepareStepState,
    reviewOpened: input.reviewOpened,
    bucketCounts: input.readiness.bucketCounts,
  });
}
