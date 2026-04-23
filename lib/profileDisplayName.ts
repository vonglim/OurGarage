import { getAuthUserDisplayName, getAuthUserIdSync } from '@/lib/authUser';
import { PROFILE_NAME_FALLBACK } from '@/lib/profileConstants';
import { getRemoteDisplayNameForUserId, fetchAndMergeProfileNames } from '@/lib/remoteProfileCache';
import { isUuidString } from '@/lib/requestOwnership';
import { isSupabaseConfigured, getSupabase } from '@/lib/supabase';

export { PROFILE_NAME_FALLBACK } from '@/lib/profileConstants';

/**
 * Resolves a stable display name for a user: local profile for self, remote `profiles.name`
 * for other UUIDs, and {@link PROFILE_NAME_FALLBACK} when the row has no name.
 */
export function getProfileNameForUserId(userId: string): string {
  const id = userId.trim();
  if (id === '') return '—';
  if (id === getAuthUserIdSync()) {
    return getAuthUserDisplayName();
  }
  if (!isUuidString(id)) {
    return PROFILE_NAME_FALLBACK;
  }
  return getRemoteDisplayNameForUserId(id)?.trim() || PROFILE_NAME_FALLBACK;
}

/**
 * Batches `profiles` rows and merges `name` into the cache. Safe to call with many ids; dedupes
 * and uses chunked `.in('id', ...)` inside {@link fetchAndMergeProfileNames}.
 */
export async function prefetchProfileNamesForUserIds(
  userIds: readonly (string | undefined | null)[]
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const ids = userIds.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
  if (ids.length === 0) return;
  await fetchAndMergeProfileNames(getSupabase(), ids);
}
