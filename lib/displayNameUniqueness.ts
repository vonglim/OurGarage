import { getSupabase } from '@/lib/supabase';
import { isUuidString } from '@/lib/requestOwnership';

/**
 * True if another profile (not `currentUserId`) already has this display name, using a
 * case-insensitive `ilike` match on a normalized query string.
 */
export async function isDisplayNameTakenByOther(
  name: string,
  currentUserId: string
): Promise<{ taken: boolean; errorMessage: string | null }> {
  const t = name.trim();
  if (t.length === 0) return { taken: false, errorMessage: null };
  if (!isUuidString(currentUserId)) return { taken: false, errorMessage: null };

  const username = t.toLowerCase();
  const sb = getSupabase();
  const { data, error } = await sb
    .from('profiles')
    .select('id')
    .ilike('name', username)
    .neq('id', currentUserId)
    .limit(1);

  if (error != null) {
    if (__DEV__) {
      console.warn('[profiles] name uniqueness check error:', error.message);
    }
    return { taken: false, errorMessage: error.message };
  }

  if (__DEV__) {
    console.log('username check:', username, data);
  }

  // Empty array [] is still truthy — use length, never `if (data)` for blocking
  const isTaken = Array.isArray(data) && data.length > 0;
  return { taken: isTaken, errorMessage: null };
}
