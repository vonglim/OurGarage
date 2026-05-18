import { useCallback, useEffect, useRef } from 'react';

import { getSupabase } from '@/lib/supabase';
import {
  registerRentalRealtimeSubscription,
  unregisterRentalRealtimeSubscription,
} from '@/lib/rentalLifecycle/realtimeSubscriptionRegistry';
import { logScenario } from '@/lib/rentalLifecycle/scenarioDevLog';

const REFRESH_DEBOUNCE_MS = 120;

/**
 * Subscribes to rentals + rental_wizard_state changes and coalesces refresh bursts (stress-safe).
 */
export function useRentalWizardRealtimeSync(
  rentalId: string,
  onRefresh: () => void | Promise<void>
): void {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const scheduleRefresh = useCallback((trigger: string, table: string) => {
    logScenario('realtime', {
      event: 'change_received',
      rentalId,
      source: 'rental_wizard_layout',
      table,
      trigger,
    });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      logScenario('realtime', {
        event: 'refresh_scheduled',
        rentalId,
        source: 'rental_wizard_layout',
        trigger,
      });
      void Promise.resolve(onRefreshRef.current()).then(() => {
        logScenario('realtime', {
          event: 'refresh_completed',
          rentalId,
          source: 'rental_wizard_layout',
        });
      });
    }, REFRESH_DEBOUNCE_MS);
  }, [rentalId]);

  useEffect(() => {
    const id = rentalId.trim();
    if (!id) return;

    const supabase = getSupabase();
    const channelName = `rental-wizard-sync-${id}`;
    registerRentalRealtimeSubscription(id, channelName, 'rental_wizard_layout');

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rentals', filter: `id=eq.${id}` },
        () => scheduleRefresh('rentals_update', 'rentals')
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rental_wizard_state', filter: `rental_id=eq.${id}` },
        () => scheduleRefresh('wizard_state_change', 'rental_wizard_state')
      )
      .subscribe((status) => {
        logScenario('realtime', {
          event: 'channel_status',
          rentalId: id,
          source: 'rental_wizard_layout',
          status,
        });
      });

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      unregisterRentalRealtimeSubscription(id, 'rental_wizard_layout');
      void supabase.removeChannel(channel);
    };
  }, [rentalId, scheduleRefresh]);
}
