import { getSupabase } from '@/lib/supabase';

let cachedUserId: string | null = null;

/**
 * In-memory cache of the current `auth.user.id` (kept in sync with the root layout’s auth
 * listener via `applySessionToAuthStore` / `setCachedAuthUserId`).
 */
export function getCachedAuthUserId(): string | null {
  return cachedUserId;
}

export function setCachedAuthUserId(userId: string | null): void {
  cachedUserId = userId;
}

/**
 * Active Supabase Auth user id (authoritative, async). Always from the session / JWT, never a device id.
 */
export async function getAuthUserId(): Promise<string | undefined> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id;
}
