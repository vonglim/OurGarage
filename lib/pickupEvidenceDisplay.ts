import type { SupabaseClient } from '@supabase/supabase-js';

import {
  normalizePickupPhotoCategory,
  type PickupPhotoCategory,
} from '@/lib/pickupVerificationPhotoBuckets';
import {
  fetchVerificationPhotos,
  signedUrlForEvidencePath,
  type RentalVerificationPhotoRow,
} from '@/lib/rentalVerification';

/** Owner pickup evidence row with a resolvable signed URL for UI. */
export type PickupEvidencePhoto = {
  id: string;
  signedUrl: string;
  storagePath: string;
  createdAt: string;
  pickupPhotoCategory: PickupPhotoCategory | null;
  uploadedBy: string;
};

export async function fetchOwnerPickupEvidenceDisplay(
  supabase: SupabaseClient,
  rentalId: string
): Promise<PickupEvidencePhoto[]> {
  const rows = await fetchVerificationPhotos(supabase, rentalId, 'pickup');
  const ownerRows = rows.filter((r) => r.role === 'owner');
  const out: PickupEvidencePhoto[] = [];
  for (const row of ownerRows) {
    const signedUrl = await signedUrlForEvidencePath(supabase, row.storage_path);
    if (!signedUrl) continue;
    out.push(mapPickupEvidencePhoto(row, signedUrl));
  }
  return out;
}

export function mapPickupEvidencePhoto(
  row: RentalVerificationPhotoRow,
  signedUrl: string
): PickupEvidencePhoto {
  return {
    id: row.id,
    signedUrl,
    storagePath: row.storage_path,
    createdAt: row.created_at,
    pickupPhotoCategory: normalizePickupPhotoCategory(row.pickup_photo_category),
    uploadedBy: row.uploaded_by,
  };
}

export function lastOwnerPickupEvidenceUpdateAt(photos: readonly PickupEvidencePhoto[]): string | null {
  let maxMs = 0;
  let iso: string | null = null;
  for (const p of photos) {
    const t = Date.parse(p.createdAt);
    if (Number.isFinite(t) && t >= maxMs) {
      maxMs = t;
      iso = p.createdAt;
    }
  }
  return iso;
}
