import { Alert, Platform } from 'react-native';
import type { Router } from 'expo-router';
import type { SupabaseClient } from '@supabase/supabase-js';

import { alertOwnerPickupEvidenceLocked } from '@/lib/pickupEvidenceLock';
import type { PickupPhotoCategory } from '@/lib/pickupVerificationPhotoBuckets';
import {
  RENTAL_EVIDENCE_BUCKET_MISSING_MESSAGE,
  uploadRentalEvidencePhoto,
} from '@/lib/rentalEvidenceUpload';
import {
  ensureVerificationRows,
  PHOTO_UPLOAD_PICKUP_CATEGORY_SCHEMA_MESSAGE,
  signedUrlForEvidencePath,
  type PartyRole,
} from '@/lib/rentalVerification';
import { useCameraSessionStore } from '@/store/cameraSessionStore';

export function openOwnerPickupEvidenceCamera(
  router: Pick<Router, 'push'>,
  rentalId: string,
  category: PickupPhotoCategory,
  pickupEvidenceLocked = false
): void {
  if (pickupEvidenceLocked) {
    alertOwnerPickupEvidenceLocked();
    return;
  }
  if (Platform.OS === 'web') {
    Alert.alert(
      'Camera',
      'Pickup photos are taken live in the OurGarage mobile app (not from your listing gallery).'
    );
    return;
  }
  const st = useCameraSessionStore.getState();
  st.setCapturedPhotoUris([]);
  st.setRentalEvidenceSession({
    rentalId,
    phase: 'pickup',
    pickupPhotoCategory: category,
    captureMode: 'photo',
  });
  router.push('/camera');
}

export async function processPendingOwnerWizardEvidenceUploads(input: {
  client: SupabaseClient;
  rentalId: string;
  ownerUserId: string;
  renterUserId: string;
  pickupEvidenceLocked?: boolean;
}): Promise<{ uploadedCount: number }> {
  if (input.pickupEvidenceLocked) {
    useCameraSessionStore.getState().setRentalEvidenceSession(null);
    useCameraSessionStore.getState().setCapturedPhotoUris([]);
    return { uploadedCount: 0 };
  }

  const st = useCameraSessionStore.getState();
  const sess = st.rentalEvidenceSession;
  const capturedPhotoUris = st.capturedPhotoUris;
  if (!sess || sess.rentalId !== input.rentalId || sess.phase !== 'pickup') {
    return { uploadedCount: 0 };
  }
  if (sess.pickupPhotoCategory == null) {
    st.setRentalEvidenceSession(null);
    st.setCapturedPhotoUris([]);
    Alert.alert(
      'Category required',
      'Open the camera from Item, Serial, or Live possession so each photo is saved to the right group.'
    );
    return { uploadedCount: 0 };
  }

  const captureMode = sess.captureMode ?? 'photo';
  st.setRentalEvidenceSession(null);
  const uris =
    captureMode === 'video' ? capturedPhotoUris.filter(Boolean).slice(0, 1) : [...capturedPhotoUris];
  st.setCapturedPhotoUris([]);
  if (uris.length === 0) return { uploadedCount: 0 };

  await ensureVerificationRows(
    input.client,
    input.rentalId,
    input.ownerUserId,
    input.renterUserId,
    'pickup'
  );

  const failures: { index: number; detail: string; code?: string }[] = [];
  let successCount = 0;
  let photoIndex = 0;

  for (const uri of uris) {
    photoIndex += 1;
    if (!uri) continue;
    const role: PartyRole = 'owner';
    const res = await uploadRentalEvidencePhoto({
      client: input.client,
      rentalId: input.rentalId,
      phase: 'pickup',
      userId: input.ownerUserId,
      role,
      localUri: uri,
      pickupPhotoCategory: sess.pickupPhotoCategory,
      pickupEvidenceLocked: input.pickupEvidenceLocked,
    });
    if (!res.ok) {
      failures.push({
        index: photoIndex,
        detail: `${res.stage}: ${res.message}`,
        code: res.code,
      });
      continue;
    }
    successCount += 1;
    const signed = await signedUrlForEvidencePath(input.client, res.storagePath);
    if (!signed) {
      failures.push({
        index: photoIndex,
        detail: 'saved to cloud; preview link failed — try refreshing this screen',
      });
    }
  }

  if (failures.length > 0) {
    const schemaMissing = failures.some((f) => f.code === 'pickup_category_schema_missing');
    const allBucketMissing = failures.every((f) => f.code === 'bucket_missing');
    if (schemaMissing) {
      Alert.alert('Upload unavailable', PHOTO_UPLOAD_PICKUP_CATEGORY_SCHEMA_MESSAGE);
    } else if (allBucketMissing) {
      Alert.alert('Rental photo storage', RENTAL_EVIDENCE_BUCKET_MISSING_MESSAGE);
    } else {
      const noun = captureMode === 'video' ? 'Video' : 'Photo';
      const lines = failures.map((f) => `• ${noun} ${f.index}: ${f.detail}`);
      Alert.alert(
        captureMode === 'video' ? 'Video could not be saved' : 'Some photos could not be saved',
        [...new Set(lines)].join('\n')
      );
    }
  }

  return { uploadedCount: successCount };
}
