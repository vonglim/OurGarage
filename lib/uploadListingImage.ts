import { Platform } from 'react-native';
import { File as ExpoFsFile } from 'expo-file-system';

import { getAuthUserIdSync } from '@/lib/authUser';
import { getSupabase } from '@/lib/supabase';

declare const __DEV__: boolean;

function normalizeContentType(blob: Blob): string {
  const t = blob.type?.trim();
  if (t && t.startsWith('image/')) return t;
  return 'image/jpeg';
}

function extensionForContentType(ct: string): string {
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  return 'jpg';
}

function contentTypeHintFromUri(uri: string): string {
  const base = uri.split('?')[0]?.toLowerCase() ?? '';
  if (base.endsWith('.png')) return 'image/png';
  if (base.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

/**
 * Native camera/gallery URIs (`file://`, etc.): read bytes via expo-file-system.
 * `fetch(uri).blob()` is unreliable on RN / Expo Go; Supabase recommends ArrayBuffer there.
 */
async function loadNativeImageForUpload(localUri: string): Promise<{
  body: ArrayBuffer;
  contentType: string;
}> {
  try {
    const file = new ExpoFsFile(localUri);
    const body = await file.arrayBuffer();
    if (!body || body.byteLength === 0) {
      throw new Error('Empty image data');
    }
    return {
      body,
      contentType: contentTypeHintFromUri(localUri),
    };
  } catch (e) {
    console.error('[uploadListingImage] native file read failed', e);
    throw e;
  }
}

/**
 * Web: blob URLs / object URLs — fetch + Blob (works reliably in browsers).
 */
async function loadWebImageForUpload(localUri: string): Promise<{ body: Blob; contentType: string }> {
  let response: Response;
  try {
    response = await fetch(localUri);
  } catch (fetchErr) {
    console.error('[uploadListingImage] fetch image URI failed', fetchErr);
    throw fetchErr;
  }

  if (!response.ok) {
    const msg = `Fetch image failed: HTTP ${response.status}`;
    throw new Error(msg);
  }

  const fallbackCopy = response.clone();

  let blob: Blob;
  try {
    blob = await response.blob();
  } catch (blobErr) {
    console.error('[uploadListingImage] response.blob() failed', blobErr);
    throw blobErr;
  }

  let uploadBlob = blob;
  let contentType = normalizeContentType(blob);

  if (blob.size === 0) {
    try {
      const buf = await fallbackCopy.arrayBuffer();
      if (!buf || buf.byteLength === 0) {
        const msg = 'Empty image data';
        throw new Error(msg);
      }
      uploadBlob = new Blob([buf], { type: contentType });
      contentType = normalizeContentType(uploadBlob);
    } catch (fallbackErr) {
      console.error('[uploadListingImage] empty blob fallback failed', fallbackErr);
      throw fallbackErr;
    }
  }

  return { body: uploadBlob, contentType };
}

/**
 * Upload a local image to Storage. Web uses Blob; native uses ArrayBuffer from expo-file-system.
 */
export async function uploadListingImage(localUri: string): Promise<string> {
  const userId = getAuthUserIdSync().trim() || 'anon';
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  let uploadPayload: Blob | ArrayBuffer;
  let contentType: string;

  if (Platform.OS === 'web') {
    const loaded = await loadWebImageForUpload(localUri);
    uploadPayload = loaded.body;
    contentType = loaded.contentType;
  } else {
    const loaded = await loadNativeImageForUpload(localUri);
    uploadPayload = loaded.body;
    contentType = loaded.contentType;
  }

  const path = `${userId}/${unique}.${extensionForContentType(contentType)}`;

  const supabase = getSupabase();
  const { error } = await supabase.storage.from('listing-images').upload(path, uploadPayload, {
    contentType,
    upsert: false,
  });

  if (error) {
    console.error('[uploadListingImage] storage upload error', error);
    throw error;
  }

  const { data } = supabase.storage.from('listing-images').getPublicUrl(path);
  const publicUrl = data.publicUrl;
  if (typeof publicUrl !== 'string' || !publicUrl.startsWith('http')) {
    console.error('[uploadListingImage] invalid public URL', data);
    throw new Error('Could not resolve public URL for uploaded image');
  }

  if (__DEV__) {
    console.log('[uploadListingImage] upload success', publicUrl);
  }
  return publicUrl;
}
