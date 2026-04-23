import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';

import { setCachedAuthUserId } from '@/lib/auth';

type AuthSessionState = {
  userId: string | null;
  /** Server-backed display name, set only after a successful `profiles` fetch. */
  profile: { name: string } | null;
};

/**
 * `userId` and server-backed `profile.name` from the root layout’s session listener
 * (see `applySessionToAuthStore`). Display the user with `profile.name` / {@link getAuthUserDisplayName} — not auth email.
 */
export const useAuthSessionStore = create<AuthSessionState>(() => ({
  userId: null,
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
      profile: newProfile,
    });
  } else {
    setCachedAuthUserId(null);
    useAuthSessionStore.setState({ userId: null, profile: null });
  }
}

/**
 * Call whenever Supabase session changes so `getAuthUserIdSync` / caches stay aligned.
 */
export function applySessionToAuthStore(session: Session | null): void {
  applyUserToStore(session?.user ?? null);
}
