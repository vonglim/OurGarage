import { Platform } from 'react-native';
import { File as ExpoFsFile } from 'expo-file-system';

import {
  contentTypeForEvidenceMediaKind,
  extensionForEvidenceContentType,
  inferEvidenceMediaKindFromPath,
} from '@/lib/evidenceMediaKind';

declare const __DEV__: boolean;

function normalizeContentType(blob: Blob, uri: string): string {
  const t = blob.type?.trim();
  if (t && (t.startsWith('image/') || t.startsWith('video/'))) return t;
  const kind = inferEvidenceMediaKindFromPath(uri);
  return contentTypeForEvidenceMediaKind(kind, uri);
}

/** File extension (no dot) for storage paths. */
export function extensionForContentType(ct: string): string {
  return extensionForEvidenceContentType(ct);
}

function contentTypeHintFromUri(uri: string): string {
  const kind = inferEvidenceMediaKindFromPath(uri);
  return contentTypeForEvidenceMediaKind(kind, uri);
}

async function loadNativeImageForUpload(localUri: string): Promise<{
  body: ArrayBuffer;
  contentType: string;
}> {
  try {
    const file = new ExpoFsFile(localUri);
    const body = await file.arrayBuffer();
    if (!body || body.byteLength === 0) {
      throw new Error('Empty media data');
    }
    return {
      body,
      contentType: contentTypeHintFromUri(localUri),
    };
  } catch (e) {
    console.error('[localImageForUpload] native file read failed', e);
    throw e;
  }
}

async function loadWebImageForUpload(localUri: string): Promise<{ body: Blob; contentType: string }> {
  let response: Response;
  try {
    response = await fetch(localUri);
  } catch (fetchErr) {
    console.error('[localImageForUpload] fetch image URI failed', fetchErr);
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
    console.error('[localImageForUpload] response.blob() failed', blobErr);
    throw blobErr;
  }

  let uploadBlob = blob;
  let contentType = normalizeContentType(blob, localUri);

  if (blob.size === 0) {
    try {
      const buf = await fallbackCopy.arrayBuffer();
      if (!buf || buf.byteLength === 0) {
        throw new Error('Empty media data');
      }
      uploadBlob = new Blob([buf], { type: contentType });
      contentType = normalizeContentType(uploadBlob, localUri);
    } catch (fallbackErr) {
      console.error('[localImageForUpload] empty blob fallback failed', fallbackErr);
      throw fallbackErr;
    }
  }

  return { body: uploadBlob, contentType };
}

/**
 * Read bytes from a local capture URI (file:// on native, blob/data on web).
 * Prefer this over raw `fetch(fileUri)` on React Native — `fetch` is unreliable for file://.
 */
/** Read bytes from a local capture URI (images or short operational videos). */
export async function loadLocalMediaForUpload(localUri: string): Promise<{
  body: ArrayBuffer | Blob;
  contentType: string;
}> {
  if (__DEV__) {
    const preview = localUri.length > 120 ? `${localUri.slice(0, 120)}…` : localUri;
    console.log('[localImageForUpload] uri', preview);
  }
  if (Platform.OS === 'web') {
    return loadWebImageForUpload(localUri);
  }
  return loadNativeImageForUpload(localUri);
}

export async function loadLocalImageForUpload(localUri: string): Promise<{
  body: ArrayBuffer | Blob;
  contentType: string;
}> {
  return loadLocalMediaForUpload(localUri);
}
