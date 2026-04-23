import { getSupabase } from '@/lib/supabase';

import { getOrCreateProfile } from '@/lib/getOrCreateProfile';

/**
 * After sign-in, ensures `public.profiles` has a row for the current auth user
 * and syncs it into the display name cache, local profile, and auth store.
 */
export async function ensureUserProfileRow(): Promise<void> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user == null) return;
  await getOrCreateProfile(user.id);
}

export { getOrCreateProfile } from '@/lib/getOrCreateProfile';
