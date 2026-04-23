import { ensureProfile } from '@/lib/ensureProfile';
import { getSupabase } from '@/lib/supabase';

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
  await ensureProfile(user);
}

export { ensureProfile, getOrCreateProfile } from '@/lib/ensureProfile';
