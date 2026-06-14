import {
  TIMESTAMP_POSSESSION_PROOF_CHECKLIST_RENTER,
  TIMESTAMP_POSSESSION_PROOF_CHECKLIST_RENTER_AUTO,
} from '@/lib/timestampPossessionProofCopy';
import type { RentalVerificationRow } from '@/lib/rentalVerification';
import { mergeChecklistMapsFromRows } from '@/lib/rentalVerification';

export type PickupChecklistItemDef = {
  id: string;
  label: string;
  required?: boolean;
  control?: 'manual' | 'auto';
};

/** Canonical renter pickup responsibilities (shared: workspace + meetup inspection). */
export const RENTER_PICKUP_ITEMS: readonly PickupChecklistItemDef[] = [
  {
    id: 'rp-review-photos',
    label: 'Review owner photos',
    required: true,
    control: 'auto',
  },
  {
    id: 'rp-serial-matches',
    label: 'Verify serial/model matches',
    required: true,
    control: 'manual',
  },
  {
    id: 'rp-verify-condition',
    label: 'Verify item condition',
    required: true,
    control: 'manual',
  },
  {
    id: 'rp-accessories',
    label: 'Confirm accessories are included',
    required: true,
    control: 'manual',
  },
  {
    id: 'rp-verify-note',
    label: TIMESTAMP_POSSESSION_PROOF_CHECKLIST_RENTER,
    required: true,
    control: 'auto',
  },
] as const;

export type RenterPickupViewerFlags = {
  reviewedOwnerPhotos: boolean;
  viewedTimestampProof: boolean;
};

export function buildRenterPickupDoneEffective(
  storedManual: Record<string, boolean>,
  viewFlags: RenterPickupViewerFlags,
  pickupRenterConfirmed: boolean
): Record<string, boolean> {
  const freezeAuto = pickupRenterConfirmed;
  return {
    'rp-review-photos': freezeAuto || viewFlags.reviewedOwnerPhotos,
    'rp-serial-matches': Boolean(storedManual['rp-serial-matches']),
    'rp-verify-condition': Boolean(storedManual['rp-verify-condition']),
    'rp-accessories': Boolean(storedManual['rp-accessories']),
    'rp-verify-note': freezeAuto || viewFlags.viewedTimestampProof,
  };
}

export function allRequiredPickupItemsDone(
  items: readonly PickupChecklistItemDef[],
  done: Record<string, boolean>
): boolean {
  return items.filter((i) => i.required !== false).every((i) => Boolean(done[i.id]));
}

export function fillPickupChecklistDefaults(
  items: readonly { id: string }[],
  stored: Record<string, boolean>
): Record<string, boolean> {
  const o: Record<string, boolean> = {};
  for (const it of items) {
    o[it.id] = Boolean(stored[it.id]);
  }
  return o;
}

export function stripPickupAutoFromStored(stored: Record<string, boolean>): Record<string, boolean> {
  const out = { ...stored };
  for (const it of RENTER_PICKUP_ITEMS) {
    if (it.control === 'auto') delete out[it.id];
  }
  return out;
}

export function manualRenterPickupMapOnly(map: Record<string, boolean>): Record<string, boolean> {
  const o: Record<string, boolean> = {};
  for (const it of RENTER_PICKUP_ITEMS) {
    if (it.control !== 'auto') o[it.id] = Boolean(map[it.id]);
  }
  return o;
}

export function pickupAutoRowHelper(itemId: string): string | undefined {
  if (itemId === 'rp-review-photos') return 'Automatically checked when you view owner photos';
  if (itemId === 'rp-verify-note') return TIMESTAMP_POSSESSION_PROOF_CHECKLIST_RENTER_AUTO;
  return undefined;
}

export function renterPickupManualFromVerificationRows(
  rows: RentalVerificationRow[],
  renterUserId: string
): Record<string, boolean> {
  const merged = mergeChecklistMapsFromRows(rows, 'pickup');
  const stored = stripPickupAutoFromStored(merged.renter);
  return fillPickupChecklistDefaults(RENTER_PICKUP_ITEMS, stored);
}

export function deriveWizardRenterViewerFlags(input: {
  renterApprovedPickupPhotosAt?: string | null;
  renterPickupEvidenceReviewOpenedAt?: string | null;
  renterViewedTimestampProofAt?: string | null;
}): RenterPickupViewerFlags {
  return {
    reviewedOwnerPhotos: Boolean(
      input.renterApprovedPickupPhotosAt?.trim() || input.renterPickupEvidenceReviewOpenedAt?.trim()
    ),
    viewedTimestampProof: Boolean(input.renterViewedTimestampProofAt?.trim()),
  };
}
