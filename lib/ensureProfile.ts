import type { User } from '@supabase/supabase-js';

import { getOrCreateProfile } from '@/lib/getOrCreateProfile';

/**
 * Ensures `public.profiles` has a row for the signed-in user, creating one with a
 * sensible default `name` (email local part) if missing. Syncs caches via {@link getOrCreateProfile}.
 */
export async function ensureProfile(user: User | null | undefined): Promise<void> {
  if (user == null) return;
  await getOrCreateProfile(user.id, user);
}

export { getOrCreateProfile } from '@/lib/getOrCreateProfile';
