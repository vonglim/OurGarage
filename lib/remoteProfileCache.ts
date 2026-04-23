import type { SupabaseClient } from '@supabase/supabase-js';

import { isUuidString } from '@/lib/requestOwnership';

const byId = new Map<string, string>();

let cacheVersion = 0;
const profileCacheListeners = new Set<() => void>();

function bumpCacheVersionIfChanged(): void {
  cacheVersion += 1;
  for (const l of profileCacheListeners) l();
}

export function subscribeToProfileCache(callback: () => void): () => void {
  profileCacheListeners.add(callback);
  return () => profileCacheListeners.delete(callback);
}

export function getProfileCacheVersionSnapshot(): number {
  return cacheVersion;
}

export function mergeProfileRowsFromServer(
  rows: { id: string; name: string }[] | null | undefined
): void {
  if (rows == null) return;
  let changed = false;
  for (const r of rows) {
    const id = String(r.id ?? '').trim();
    if (id === '' || !isUuidString(id)) continue;
    const n = String(r.name ?? '').trim();
    if (n !== '' && byId.get(id) !== n) {
      byId.set(id, n);
      changed = true;
    }
  }
  if (changed) bumpCacheVersionIfChanged();
}

/** Single-row merge (e.g. after local edit). */
export function setRemoteDisplayNameForUserId(userId: string, name: string): void {
  const id = String(userId ?? '').trim();
  if (id === '' || !isUuidString(id)) return;
  const n = name.trim();
  if (n === '') return;
  if (byId.get(id) === n) return;
  byId.set(id, n);
  bumpCacheVersionIfChanged();
}

export function getRemoteDisplayNameForUserId(userId: string | undefined | null): string | null {
  const id = (userId ?? '').trim();
  if (id === '' || !isUuidString(id)) return null;
  return byId.get(id) ?? null;
}

export function clearRemoteProfileCache(): void {
  if (byId.size === 0) return;
  byId.clear();
  bumpCacheVersionIfChanged();
}

/**
 * Batches `id` in `public.profiles` and merges `name` into the in-memory cache
 * (used for requests owner, offer renter, and message author display).
 */
export async function fetchAndMergeProfileNames(
  supabase: SupabaseClient,
  userIds: readonly string[]
): Promise<void> {
  const unique = [
    ...new Set(
      userIds
        .map((s) => s.trim())
        .filter((id) => isUuidString(id))
    ),
  ];
  if (unique.length === 0) return;

  // Chunk: very large `.in('id', …)` lists can exceed URL limits and return 4xx from PostgREST.
  const CHUNK = 120;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const { data, error } = await supabase.from('profiles').select('id, name').in('id', chunk);
    if (error != null) {
      if (__DEV__) console.warn('[profiles] batch fetch:', error.message);
      continue;
    }
    mergeProfileRowsFromServer((data ?? []) as { id: string; name: string }[]);
  }
}
