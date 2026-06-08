import { Alert } from 'react-native';

import type { RentalWizardProgress } from '@/lib/rentalWizard/types';

export type PickupEvidenceLockInput = Pick<
  RentalWizardProgress,
  'renter_approved_pickup_photos_at'
>;

export const OWNER_PICKUP_EVIDENCE_LOCKED_ERROR =
  'The renter has already approved these pickup photos. Pickup evidence can no longer be changed.';

/** True once the renter has approved the owner pickup evidence package. */
export function isOwnerPickupEvidenceLocked(
  wizardProgress: PickupEvidenceLockInput | null | undefined
): boolean {
  return Boolean(wizardProgress?.renter_approved_pickup_photos_at?.trim());
}

export function alertOwnerPickupEvidenceLocked(): void {
  Alert.alert('Pickup evidence locked', OWNER_PICKUP_EVIDENCE_LOCKED_ERROR);
}
