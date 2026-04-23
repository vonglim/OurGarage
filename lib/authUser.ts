import { getCachedAuthUserId } from '@/lib/auth';
import { PROFILE_NAME_FALLBACK } from '@/lib/profileConstants';
import { getProfile, useProfile } from '@/store/profileStore';
import { useAuthSessionStore } from '@/store/authSessionStore';

/**
 * Sync `userId` is always the Supabase auth user id (from the same source as `getUser().user.id`).
 * When not signed in, the empty string is returned — never a synthetic device or placeholder id.
 */

export const AUTH_USER_DISPLAY_NAME = 'You' as const;

export type AuthUser = {
  id: string;
  name: typeof AUTH_USER_DISPLAY_NAME;
};

/**
 * Supabase `user.id` from the hydrated session (set from the same `auth.getUser` / `getSession` pipeline as root layout).
 * For authoritative checks in async code, use {@link getAuthUserId} from `@/lib/auth`.
 */
export function getAuthUserIdSync(): string {
  return useAuthSessionStore.getState().userId?.trim() || getCachedAuthUserId()?.trim() || '';
}

export function useAuthUserId(): string {
  return useAuthSessionStore((s) => s.userId?.trim() || getCachedAuthUserId()?.trim() || '');
}

export function getAuthUser(): AuthUser {
  return { id: getAuthUserIdSync(), name: AUTH_USER_DISPLAY_NAME };
}

export function useAuthUser(): AuthUser {
  return { id: useAuthUserId(), name: AUTH_USER_DISPLAY_NAME };
}

/**
 * Resolves the signed-in user’s display name. Prefer the server-backed `profiles.name`
 * copy in the auth store (set by {@link getOrCreateProfile} / profile updates); then local row.
 */
export function getAuthUserDisplayName(): string {
  const fromSession = useAuthSessionStore.getState().profile?.name?.trim();
  if (fromSession) return fromSession;
  return getProfile().name?.trim() || PROFILE_NAME_FALLBACK;
}

/** For UI: re-renders when the session profile or `profileStore` name changes. */
export function useAuthUserDisplayName(): string {
  const fromSession = useAuthSessionStore((s) => s.profile?.name);
  const p = useProfile();
  const t = (fromSession?.trim() || p.name?.trim() || '').trim();
  return t || PROFILE_NAME_FALLBACK;
}
