import type { SupabaseClient } from '@supabase/supabase-js';

import { OWNER_PICKUP_EVIDENCE_LOCKED_ERROR } from '@/lib/pickupEvidenceLock';
import { BUCKET, deleteVerificationPhotoById } from '@/lib/rentalVerification';

export type DeleteRentalEvidencePhotoResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Deletes a verification evidence row and its storage object.
 * Call only after UI/RLS checks; this enforces uploader === actor.
 */
export async function deleteRentalEvidencePhoto(params: {
  client: SupabaseClient;
  photoId: string;
  uploadedByUserId: string;
  actorUserId: string;
  storagePath: string | null | undefined;
  /** Set when deleting owner pickup evidence after renter approval. */
  pickupEvidenceLocked?: boolean;
}): Promise<DeleteRentalEvidencePhotoResult> {
  if (params.pickupEvidenceLocked) {
    return { ok: false, error: OWNER_PICKUP_EVIDENCE_LOCKED_ERROR };
  }

  const actor = String(params.actorUserId ?? '').trim();
  const uploader = String(params.uploadedByUserId ?? '').trim();
  if (!actor || !uploader || actor !== uploader) {
    return { ok: false, error: 'You can only delete photos you uploaded.' };
  }

  const dbResult = await deleteVerificationPhotoById(params.client, params.photoId);
  if (!dbResult.ok) {
    return { ok: false, error: dbResult.error ?? 'Could not delete photo record.' };
  }

  const path = typeof params.storagePath === 'string' ? params.storagePath.trim() : '';
  if (path.length > 0) {
    const { error } = await params.client.storage.from(BUCKET).remove([path]);
    if (error != null && __DEV__) {
      console.warn('[deleteRentalEvidencePhoto] storage remove', path, error.message);
    }
  }

  return { ok: true };
}
