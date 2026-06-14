import {
  buildPickupHandoffCompletionInputFromWizard,
  resolvePickupHandoffCompletionState,
} from '@/lib/pickupHandoffCompletion';
import type { RenterWizardHandoffPatch } from '@/lib/pickupHandoffLive';
import type { RentalWizardProgress } from '@/lib/rentalWizard/types';

import type { OwnerRentalWizardContext } from '@/lib/ownerRentalWizard/types';

/** Merge renter handoff wizard fields onto owner ctx (mirrors renter wizard layout). */
export function mergeRenterWizardHandoffProgress(
  prev: RentalWizardProgress,
  patch: RenterWizardHandoffPatch
): RentalWizardProgress {
  return {
    ...prev,
    ...(patch.renterPickupImHereAt != null
      ? { renter_pickup_im_here_at: patch.renterPickupImHereAt }
      : {}),
    ...(patch.renterApprovedPickupPhotosAt != null
      ? { renter_approved_pickup_photos_at: patch.renterApprovedPickupPhotosAt }
      : {}),
    ...(patch.renterConfirmedPickupReceiptAt != null
      ? { renter_confirmed_pickup_receipt_at: patch.renterConfirmedPickupReceiptAt }
      : {}),
  };
}

type RentalReceiptSlice = { renter_confirmed_receipt_at?: string | null };

/** Keep rental milestone and renter wizard receipt timestamp aligned on owner ctx. */
export function syncRenterPickupReceiptMilestones<
  TRental extends RentalReceiptSlice,
>(rental: TRental, wizardProgress: RentalWizardProgress): {
  rental: TRental;
  wizardProgress: RentalWizardProgress;
} {
  const wizardReceipt = wizardProgress.renter_confirmed_pickup_receipt_at?.trim();
  const rentalReceipt = rental.renter_confirmed_receipt_at?.trim();
  const canonical = wizardReceipt || rentalReceipt;
  if (!canonical) return { rental, wizardProgress };

  return {
    rental: rentalReceipt ? rental : { ...rental, renter_confirmed_receipt_at: canonical },
    wizardProgress: wizardReceipt
      ? wizardProgress
      : { ...wizardProgress, renter_confirmed_pickup_receipt_at: canonical },
  };
}

export function ownerCtxHasRenterConfirmedReceipt(ctx: OwnerRentalWizardContext): boolean {
  return resolvePickupHandoffCompletionState(
    buildPickupHandoffCompletionInputFromWizard(ctx)
  ).renterConfirmedReceipt;
}

export function applyOwnerRenterHandoffPatchToContext(
  prev: OwnerRentalWizardContext,
  patch: RenterWizardHandoffPatch
): OwnerRentalWizardContext {
  const nextProgress = mergeRenterWizardHandoffProgress(prev.wizardProgress, patch);
  const synced = syncRenterPickupReceiptMilestones(prev.rental, nextProgress);
  return {
    ...prev,
    rental: synced.rental,
    wizardProgress: synced.wizardProgress,
  };
}

export function applyOwnerRentalReceiptLivePatchToContext(
  prev: OwnerRentalWizardContext
): OwnerRentalWizardContext {
  const synced = syncRenterPickupReceiptMilestones(prev.rental, prev.wizardProgress);
  if (
    synced.rental === prev.rental &&
    synced.wizardProgress === prev.wizardProgress
  ) {
    return prev;
  }
  return {
    ...prev,
    rental: synced.rental,
    wizardProgress: synced.wizardProgress,
  };
}

/** True when a receipt wizard patch alone can flip completion on the current owner ctx. */
export function ownerHandoffReceiptPatchIsLocallySufficient(
  prev: OwnerRentalWizardContext,
  patch: RenterWizardHandoffPatch
): boolean {
  if (!patch.renterConfirmedPickupReceiptAt?.trim()) return false;
  return ownerCtxHasRenterConfirmedReceipt(applyOwnerRenterHandoffPatchToContext(prev, patch));
}
