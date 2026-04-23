import { getCachedAuthUserId } from '@/lib/auth';
import { PROFILE_NAME_FALLBACK } from '@/lib/profileConstants';
import { getProfile } from '@/store/profileStore';
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

export function getAuthUserDisplayName(): string {
  const profile = getProfile();
  return profile.name?.trim() || PROFILE_NAME_FALLBACK;
}
