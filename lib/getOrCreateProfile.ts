import type { User } from '@supabase/supabase-js';

import { isUuidString } from '@/lib/requestOwnership';
import { getSupabase } from '@/lib/supabase';
import { mergeProfileRowsFromServer } from '@/lib/remoteProfileCache';
import { PROFILE_NAME_FALLBACK } from '@/lib/profileConstants';
import { profileNeedsCreateUsername } from '@/lib/profileOnboarding';
import { getProfile, updateProfile } from '@/store/profileStore';
import { useAuthSessionStore } from '@/store/authSessionStore';

function normalizeNameFromRow(raw: string | null | undefined): string {
  const t = (raw ?? '').trim();
  return t !== '' ? t : PROFILE_NAME_FALLBACK;
}

/**
 * Fetches `public.profiles` for the user, inserts a row if missing, syncs
 * server truth into the remote name cache, AsyncStorage profile, and auth store.
 * New rows use an empty `name` so the Create Username step can set `profiles.name`.
 */
export type GetOrCreateProfileResult = {
  id: string;
  name: string;
  needsCreateUsername: boolean;
};

export async function getOrCreateProfile(
  userId: string,
  authUser?: User | null
): Promise<GetOrCreateProfileResult | null> {
  const id = String(userId ?? '').trim();
  if (id === '' || !isUuidString(id)) return null;

  const supabase = getSupabase();
  const { data: found, error: fetchErr } = await supabase
    .from('profiles')
    .select('id, name')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr != null) {
    if (__DEV__) console.warn('[profiles] getOrCreate read:', fetchErr.message);
    return null;
  }

  let rawFromDb: string | null | undefined;

  if (found) {
    const row = found as { id: string; name: string | null | undefined };
    rawFromDb = row.name;
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from('profiles')
      .insert({ id, name: '' })
      .select('id, name')
      .single();

    if (insErr != null) {
      if (insErr.code === '23505') {
        const { data: afterDup, error: reErr } = await supabase
          .from('profiles')
          .select('id, name')
          .eq('id', id)
          .single();
        if (reErr != null) {
          if (__DEV__) console.warn('[profiles] getOrCreate re-read:', reErr.message);
          return null;
        }
        rawFromDb = (afterDup as { name?: string | null }).name;
      } else {
        if (__DEV__) console.warn('[profiles] getOrCreate insert:', insErr.message);
        return null;
      }
    } else {
      const row = inserted as { name?: string | null };
      rawFromDb = row.name;
    }
  }

  const needsCreateUsername = profileNeedsCreateUsername(rawFromDb);
  const nameForLocal = needsCreateUsername ? '' : normalizeNameFromRow(rawFromDb);
  if (!needsCreateUsername) {
    mergeProfileRowsFromServer([{ id, name: nameForLocal }]);
  }
  const prev = getProfile();
  const keepBio = prev.userId === id || prev.userId === 'profile_unlinked' ? prev.bio : '';
  await updateProfile({ userId: id, name: nameForLocal, bio: keepBio, avatar: prev.avatar });

  useAuthSessionStore.setState({ profile: { name: nameForLocal } });

  return { id, name: nameForLocal, needsCreateUsername };
}
