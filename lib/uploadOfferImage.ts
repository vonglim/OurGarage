import { getAuthUserIdSync } from '@/lib/authUser';
import { extensionForContentType, loadLocalImageForUpload } from '@/lib/localImageForUpload';
import { getSupabase } from '@/lib/supabase';

declare const __DEV__: boolean;

/**
 * Upload a local image for an offer to the same public bucket as listing photos (`listing-images`).
 */
export async function uploadOfferImage(uri: string): Promise<string> {
  const userId = getAuthUserIdSync().trim() || 'anon';
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const loaded = await loadLocalImageForUpload(uri);
  const uploadPayload = loaded.body;
  const contentType = loaded.contentType;

  const path = `${userId}/offer-${unique}.${extensionForContentType(contentType)}`;

  const supabase = getSupabase();
  const { error } = await supabase.storage.from('listing-images').upload(path, uploadPayload, {
    contentType,
    upsert: false,
  });

  if (error) {
    console.error('[uploadOfferImage] storage upload error', error);
    throw error;
  }

  const { data } = supabase.storage.from('listing-images').getPublicUrl(path);
  const publicUrl = data.publicUrl;
  if (typeof publicUrl !== 'string' || !publicUrl.startsWith('http')) {
    console.error('[uploadOfferImage] invalid public URL', data);
    throw new Error('Could not resolve public URL for uploaded image');
  }

  if (__DEV__) {
    console.log('[uploadOfferImage] upload success', publicUrl);
  }
  return publicUrl;
}
