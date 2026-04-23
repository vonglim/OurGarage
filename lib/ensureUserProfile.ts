import { getSupabase } from '@/lib/supabase';
import { mergeProfileRowsFromServer } from '@/lib/remoteProfileCache';

/**
 * After sign-in, ensures `public.profiles` has a row for the current auth user
 * and merges it into the display-name cache.
 */
export async function ensureUserProfileRow(): Promise<void> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user == null) return;

  const { data: profile, error: selErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  const notFound = selErr != null && (selErr as { code?: string }).code === 'PGRST116';
  if (selErr != null && !notFound) {
    if (__DEV__) console.warn('[profiles] ensure read:', selErr.message);
    return;
  }

  if (profile != null && !notFound) {
    const n = (profile as { name?: string }).name;
    mergeProfileRowsFromServer([{ id: user.id, name: typeof n === 'string' && n.trim() !== '' ? n.trim() : 'User' }]);
    return;
  }

  const name = (user.email != null && user.email.trim() !== '' ? user.email.trim() : null) || 'User';
  const { error: insErr } = await supabase.from('profiles').insert({
    id: user.id,
    name,
  });
  if (insErr != null) {
    if (insErr.code === '23505') {
      mergeProfileRowsFromServer([{ id: user.id, name }]);
      return;
    }
    if (__DEV__) console.warn('[profiles] ensure insert:', insErr.message);
    return;
  }
  mergeProfileRowsFromServer([{ id: user.id, name }]);
}
