import type { SupabaseClient } from '@supabase/supabase-js';

import { extensionForContentType, loadLocalMediaForUpload } from '@/lib/localImageForUpload';
import { OWNER_PICKUP_EVIDENCE_LOCKED_ERROR } from '@/lib/pickupEvidenceLock';
import type { PickupPhotoCategory } from '@/lib/pickupVerificationPhotoBuckets';
import {
  BUCKET,
  evidenceObjectPath,
  insertVerificationPhotoRow,
  isMissingPickupPhotoCategoryColumnError,
  PHOTO_UPLOAD_PICKUP_CATEGORY_SCHEMA_MESSAGE,
  type PartyRole,
  type VerificationPhase,
} from '@/lib/rentalVerification';

declare const __DEV__: boolean;

function randomId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** User-facing when Storage returns bucket-not-found (migration / wrong project). */
export const RENTAL_EVIDENCE_BUCKET_MISSING_MESSAGE =
  'Rental photo storage bucket is missing from Supabase. Apply migration 028 (or create the rental-evidence bucket) in the same project as this app.';

export type RentalEvidenceUploadFailure = {
  ok: false;
  stage: 'read' | 'upload' | 'db';
  message: string;
  code?: 'bucket_missing' | 'pickup_category_schema_missing';
};

export type RentalEvidenceUploadSuccess = {
  ok: true;
  storagePath: string;
  dbRowId: string;
};

export type RentalEvidenceUploadResult = RentalEvidenceUploadSuccess | RentalEvidenceUploadFailure;

function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return 'Unknown error';
  }
}

function isBucketNotFoundStorageError(message: string): boolean {
  const m = message.toLowerCase();
  if (m.includes('bucket not found')) return true;
  if (m.includes('invalid') && m.includes('bucket')) return true;
  if (m.includes('no such bucket')) return true;
  if (m.includes('not found') && m.includes('storage')) return true;
  return false;
}

/** Upload one camera capture to `rental-evidence` and insert `rental_verification_photos`. */
export async function uploadRentalEvidencePhoto(params: {
  client: SupabaseClient;
  rentalId: string;
  phase: VerificationPhase;
  userId: string;
  role: PartyRole;
  localUri: string;
  /** Set for owner pickup uploads from a specific tile. */
  pickupPhotoCategory?: PickupPhotoCategory | null;
  /** Set when owner pickup evidence is locked after renter approval. */
  pickupEvidenceLocked?: boolean;
}): Promise<RentalEvidenceUploadResult> {
  const { client, rentalId, phase, userId, role, localUri, pickupPhotoCategory, pickupEvidenceLocked } =
    params;

  if (phase === 'pickup' && role === 'owner' && pickupEvidenceLocked) {
    return { ok: false, stage: 'db', message: OWNER_PICKUP_EVIDENCE_LOCKED_ERROR };
  }
  const fileId = randomId();

  let body: ArrayBuffer | Blob;
  let contentType: string;
  try {
    const loaded = await loadLocalMediaForUpload(localUri);
    body = loaded.body;
    contentType = loaded.contentType;
    if (__DEV__) {
      const bytes = body instanceof Blob ? body.size : body.byteLength;
      console.log('[rentalEvidenceUpload] bytes ready', { bytes, contentType });
    }
  } catch (e) {
    const message = errMessage(e);
    console.warn('[rentalEvidenceUpload] read failed', message);
    return { ok: false, stage: 'read', message };
  }

  const ext = extensionForContentType(contentType);
  const path = evidenceObjectPath(rentalId, phase, userId, fileId, ext);

  const { error: uploadError } = await client.storage.from(BUCKET).upload(path, body, {
    contentType,
    upsert: false,
  });
  if (uploadError) {
    const raw = uploadError.message;
    console.warn('[rentalEvidenceUpload] storage upload', raw, uploadError);
    const bucketMissing = isBucketNotFoundStorageError(raw);
    return {
      ok: false,
      stage: 'upload',
      message: bucketMissing ? RENTAL_EVIDENCE_BUCKET_MISSING_MESSAGE : raw,
      code: bucketMissing ? 'bucket_missing' : undefined,
    };
  }

  if (__DEV__) {
    console.log('[rentalEvidenceUpload] storage ok', path);
  }

  const categoryTrimmed =
    pickupPhotoCategory != null && String(pickupPhotoCategory).trim() !== ''
      ? String(pickupPhotoCategory).trim()
      : '';
  const wantsPickupCategory = phase === 'pickup' && role === 'owner' && categoryTrimmed !== '';
  const wantsReturnCategory = phase === 'return' && role === 'renter' && categoryTrimmed !== '';

  const { row: inserted, error: insertErr } = await insertVerificationPhotoRow(client, {
    rental_id: rentalId,
    phase,
    uploaded_by: userId,
    role,
    storage_path: path,
    public_url: '',
    pickup_photo_category:
      wantsPickupCategory || wantsReturnCategory ? (categoryTrimmed as typeof pickupPhotoCategory) : null,
  });

  if (!inserted) {
    if ((wantsPickupCategory || wantsReturnCategory) && insertErr != null && isMissingPickupPhotoCategoryColumnError(insertErr)) {
      if (__DEV__) {
        console.warn(
          '[rentalEvidenceUpload] pickup_photo_category missing on rental_verification_photos — apply supabase/migrations/045_pickup_photo_category.sql in Supabase, then reload schema (Dashboard → API → Reload schema or wait for cache).'
        );
      }
      const { error: removeErr } = await client.storage.from(BUCKET).remove([path]);
      if (removeErr) {
        console.warn('[rentalEvidenceUpload] orphan object cleanup failed', path, removeErr.message);
      }
      return {
        ok: false,
        stage: 'db',
        message: PHOTO_UPLOAD_PICKUP_CATEGORY_SCHEMA_MESSAGE,
        code: 'pickup_category_schema_missing',
      };
    }
    const message = insertErr?.message ?? 'Database insert failed';
    console.warn('[rentalEvidenceUpload] db insert failed', message, insertErr);
    const { error: removeErr } = await client.storage.from(BUCKET).remove([path]);
    if (removeErr) {
      console.warn('[rentalEvidenceUpload] orphan object cleanup failed', path, removeErr.message);
    }
    return { ok: false, stage: 'db', message };
  }

  if (__DEV__) {
    console.log('[rentalEvidenceUpload] db row', inserted.id);
  }

  return { ok: true, storagePath: path, dbRowId: inserted.id };
}
