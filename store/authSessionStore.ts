import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';

import { setCachedAuthUserId } from '@/lib/auth';

type AuthSessionState = {
  userId: string | null;
  userEmail: string | null;
};

/**
 * User id + email, kept in sync from the root layout’s Supabase session listener
 * (see `applySessionToAuthStore`).
 */
export const useAuthSessionStore = create<AuthSessionState>(() => ({
  userId: null,
  userEmail: null,
}));

function applyUserToStore(user: User | null): void {
  if (user) {
    setCachedAuthUserId(user.id);
    useAuthSessionStore.setState({ userId: user.id, userEmail: user.email ?? null });
  } else {
    setCachedAuthUserId(null);
    useAuthSessionStore.setState({ userId: null, userEmail: null });
  }
}

/**
 * Call whenever Supabase session changes so `getAuthUserIdSync` / caches stay aligned.
 */
export function applySessionToAuthStore(session: Session | null): void {
  applyUserToStore(session?.user ?? null);
}
