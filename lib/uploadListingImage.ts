import { getAuthUserIdSync } from '@/lib/authUser';
import { getSupabase } from '@/lib/supabase';

/**
 * Upload a local image file (file://, content://, blob:, etc.) to Supabase Storage and return its public https URL.
 */
export async function uploadListingImage(localUri: string): Promise<string> {
  const userId = getAuthUserIdSync().trim() || 'anon';
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const path = `${userId}/${unique}.jpg`;

  const response = await fetch(localUri);
  const body = await response.arrayBuffer();

  const supabase = getSupabase();
  const { error } = await supabase.storage
    .from('listing-images')
    .upload(path, body, {
      contentType: 'image/jpeg',
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

  console.log('[uploadListingImage] upload success', publicUrl);
  return publicUrl;
}
