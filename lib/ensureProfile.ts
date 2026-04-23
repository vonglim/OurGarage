import type { User } from '@supabase/supabase-js';

import { getOrCreateProfile, type GetOrCreateProfileResult } from '@/lib/getOrCreateProfile';

/**
 * Ensures `public.profiles` has a row for the current auth user. Returns whether the
 * Create Username onboarding step is still required.
 */
export async function ensureProfile(
  user: User | null | undefined
): Promise<GetOrCreateProfileResult | null> {
  if (user == null) return null;
  return getOrCreateProfile(user.id, user);
}

export { getOrCreateProfile, type GetOrCreateProfileResult } from '@/lib/getOrCreateProfile';
