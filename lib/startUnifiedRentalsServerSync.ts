import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { logRentalLifecycle } from '@/lib/rentalLifecycleDebug';
import { useUnifiedRentalsActivityStore } from '@/store/unifiedRentalsActivityStore';

/**
 * Keeps {@link useUnifiedRentalsActivityStore} in sync with `public.rentals` while the user is signed in.
 * Uses two filtered Realtime channels (renter vs owner) so INSERT/UPDATE propagate even when Activity stack is not mounted.
 */
export function startUnifiedRentalsServerSync(userId: string): () => void {
  if (!isSupabaseConfigured()) {
    return () => undefined;
  }
  const uid = userId.trim();
  if (!uid) {
    return () => undefined;
  }

  const supabase = getSupabase();
  let cancelled = false;

  const tick = (reason: string) => {
    if (cancelled) return;
    if (__DEV__) {
      logRentalLifecycle('unified_rentals_realtime', { reason });
    }
    void useUnifiedRentalsActivityStore.getState().refreshFromServer();
  };

  void useUnifiedRentalsActivityStore.getState().refreshFromServer();

  const channelId =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

  const chRenter = supabase
    .channel(`unified_rentals_renter:${uid}:${channelId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'rentals',
        filter: `renter_user_id=eq.${uid}`,
      },
      () => tick('rentals_as_renter')
    )
    .subscribe();

  const chOwner = supabase
    .channel(`unified_rentals_owner:${uid}:${channelId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'rentals',
        filter: `owner_user_id=eq.${uid}`,
      },
      () => tick('rentals_as_owner')
    )
    .subscribe();

  return () => {
    cancelled = true;
    void supabase.removeChannel(chRenter);
    void supabase.removeChannel(chOwner);
    useUnifiedRentalsActivityStore.getState().reset();
  };
}
