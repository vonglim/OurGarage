import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';

import { setCachedAuthUserId } from '@/lib/auth';

type AuthSessionState = {
  userId: string | null;
  userEmail: string | null;
  /** Server-backed display name, set only after a successful `profiles` fetch. */
  profile: { name: string } | null;
};

/**
 * User id + email, kept in sync from the root layout’s Supabase session listener
 * (see `applySessionToAuthStore`). `profile` is the cache of `profiles.name` (never local-only).
 */
export const useAuthSessionStore = create<AuthSessionState>(() => ({
  userId: null,
  userEmail: null,
  profile: null,
}));

function applyUserToStore(user: User | null): void {
  if (user) {
    setCachedAuthUserId(user.id);
    const prev = useAuthSessionStore.getState();
    const newProfile =
      prev.userId != null && prev.userId === user.id ? prev.profile : null;
    useAuthSessionStore.setState({
      userId: user.id,
      userEmail: user.email ?? null,
      profile: newProfile,
    });
  } else {
    setCachedAuthUserId(null);
    useAuthSessionStore.setState({ userId: null, userEmail: null, profile: null });
  }
}

/**
 * Call whenever Supabase session changes so `getAuthUserIdSync` / caches stay aligned.
 */
export function applySessionToAuthStore(session: Session | null): void {
  applyUserToStore(session?.user ?? null);
}
