import type { User } from '@supabase/supabase-js';

import { isUuidString } from '@/lib/requestOwnership';
import { getSupabase } from '@/lib/supabase';
import { mergeProfileRowsFromServer } from '@/lib/remoteProfileCache';
import { PROFILE_NAME_FALLBACK } from '@/lib/profileConstants';
import { getProfile, updateProfile } from '@/store/profileStore';
import { useAuthSessionStore } from '@/store/authSessionStore';

function normalizeNameFromRow(raw: string | null | undefined): string {
  const t = (raw ?? '').trim();
  return t !== '' ? t : PROFILE_NAME_FALLBACK;
}

function defaultNameForNewProfile(authUser: User | null | undefined): string {
  const fromEmail = authUser?.email?.split('@')[0]?.trim() ?? '';
  if (fromEmail !== '') return fromEmail;
  return PROFILE_NAME_FALLBACK;
}

/**
 * Fetches `public.profiles` for the user, inserts a row if missing, syncs
 * server truth into the remote name cache, AsyncStorage profile, and auth store.
 *
 * @param authUser - When a new row is inserted, `name` defaults from the user’s email local
 *   part (e.g. `jane@…` → `jane`); pass when available so first-time users get a real handle.
 */
export async function getOrCreateProfile(
  userId: string,
  authUser?: User | null
): Promise<{ id: string; name: string } | null> {
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

  let name: string;

  if (found) {
    const row = found as { id: string; name: string | null | undefined };
    name = normalizeNameFromRow(row.name);
  } else {
    const insertName = defaultNameForNewProfile(authUser);
    const { data: inserted, error: insErr } = await supabase
      .from('profiles')
      .insert({ id, name: insertName })
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
        name = normalizeNameFromRow((afterDup as { name?: string }).name);
      } else {
        if (__DEV__) console.warn('[profiles] getOrCreate insert:', insErr.message);
        return null;
      }
    } else {
      const row = inserted as { name?: string | null };
      name = normalizeNameFromRow(row.name);
    }
  }

  mergeProfileRowsFromServer([{ id, name }]);

  const prev = getProfile();
  const keepBio = prev.userId === id || prev.userId === 'profile_unlinked' ? prev.bio : '';
  await updateProfile({ userId: id, name, bio: keepBio, avatar: prev.avatar });

  useAuthSessionStore.setState({ profile: { name } });

  return { id, name };
}
