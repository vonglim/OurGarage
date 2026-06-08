import { useCallback, useEffect, useRef } from 'react';

import {
  extractRenterWizardHandoffPatch,
  type PickupHandoffPresenceRentalPatch,
  type RenterWizardHandoffPatch,
} from '@/lib/pickupHandoffLive';
import {
  registerRentalRealtimeSubscription,
  unregisterRentalRealtimeSubscription,
} from '@/lib/rentalLifecycle/realtimeSubscriptionRegistry';
import {
  meetupCoordinationFieldsDiffer,
  meetupCoordinationPatchFromRow,
} from '@/lib/rentalMeetupCoordinationLive';
import {
  parseRentalsLiveUpdate,
  type RentalsLiveUpdateResult,
} from '@/lib/rentalLifecycle/rentalRowLivePatch';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { logScenario } from '@/lib/rentalLifecycle/scenarioDevLog';
import { logCoordinationSyncTrace } from '@/lib/rentalWizard/coordinationSyncDevLog';
import { getSupabase } from '@/lib/supabase';

const DEFAULT_DEBOUNCE_MS = 120;

export type RentalWizardRealtimeSyncMeta = {
  triggerSource: string;
  table: string;
  receivedAt: number;
  coordinationChangedFields?: string[];
};

export type UseRentalWizardRealtimeSyncOptions = {
  surface?: string;
  onRentalRowLivePatch?: (
    live: RentalsLiveUpdateResult,
    meta: RentalWizardRealtimeSyncMeta
  ) => void;
  onRentalPresencePatch?: (
    patch: PickupHandoffPresenceRentalPatch,
    meta: RentalWizardRealtimeSyncMeta
  ) => void;
  onRentalCoordinationPatch?: (
    patch: RentalsLiveUpdateResult['patch'],
    meta: RentalWizardRealtimeSyncMeta & { changedFields: string[] }
  ) => void;
  onRenterWizardHandoffPatch?: (
    patch: RenterWizardHandoffPatch,
    meta: RentalWizardRealtimeSyncMeta
  ) => void;
  debounceMs?: number;
  getCoordinationBaseline?: () => Record<string, unknown> | null;
};

/**
 * Subscribes to rentals + wizard + verification changes.
 * Live presence/coordination fields patch immediately (0ms); other bursts are debounced.
 */
export function useRentalWizardRealtimeSync(
  rentalId: string,
  onRefresh: () => void | Promise<void>,
  options?: UseRentalWizardRealtimeSyncOptions
): void {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onRefreshRef = useRef(onRefresh);
  const optionsRef = useRef(options);
  onRefreshRef.current = onRefresh;
  optionsRef.current = options;
  const surface = options?.surface ?? 'rental_wizard_layout';

  const runImmediateRefresh = useCallback(
    (meta: RentalWizardRealtimeSyncMeta) => {
      logScenario('realtime', {
        event: 'live_row_refresh_immediate',
        rentalId,
        source: surface,
        trigger: meta.triggerSource,
        table: meta.table,
      });
      void Promise.resolve(onRefreshRef.current());
    },
    [rentalId, surface]
  );

  const scheduleDebouncedRefresh = useCallback(
    (meta: RentalWizardRealtimeSyncMeta) => {
      const ms = optionsRef.current?.debounceMs ?? DEFAULT_DEBOUNCE_MS;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        logScenario('realtime', {
          event: 'refresh_scheduled',
          rentalId,
          source: surface,
          trigger: meta.triggerSource,
          debounceMs: ms,
        });
        void Promise.resolve(onRefreshRef.current()).then(() => {
          logScenario('realtime', {
            event: 'refresh_completed',
            rentalId,
            source: surface,
          });
        });
      }, ms);
    },
    [rentalId, surface]
  );

  const handleChange = useCallback(
    (triggerSource: string, table: string, payload: unknown) => {
      const meta: RentalWizardRealtimeSyncMeta = {
        triggerSource,
        table,
        receivedAt: Date.now(),
      };

      logScenario('realtime', {
        event: 'change_received',
        rentalId,
        source: surface,
        table,
        trigger: triggerSource,
      });

      if (table === 'rentals') {
        const rentalsPayload = payload as RealtimePostgresChangesPayload<Record<string, unknown>>;
        const coordinationBaseline = optionsRef.current?.getCoordinationBaseline?.() ?? null;
        const newRow = rentalsPayload.new as Record<string, unknown> | undefined;
        logCoordinationSyncTrace('realtime_received', {
          surface,
          triggerSource,
          table,
          rentalId,
          hasBaseline: Boolean(coordinationBaseline),
          pickup_datetime: newRow?.pickup_datetime ?? null,
          meetup_location: newRow?.meetup_location ?? null,
          last_proposed_by: newRow?.last_proposed_by ?? null,
          proposal_version: newRow?.proposal_version ?? null,
        });
        let live = parseRentalsLiveUpdate(rentalsPayload, { coordinationBaseline });
        if (!live) {
          const newRow = rentalsPayload.new as Record<string, unknown> | undefined;
          if (
            newRow &&
            coordinationBaseline &&
            meetupCoordinationFieldsDiffer(coordinationBaseline, newRow)
          ) {
            if (typeof __DEV__ !== 'undefined' && __DEV__) {
              console.log('[realtime-rentals-handler]', {
                event: 'synthetic_coordination_patch_from_baseline',
                surface,
                triggerSource,
                last_proposed_by: newRow.last_proposed_by ?? null,
                proposal_version: newRow.proposal_version ?? null,
              });
            }
            live = {
              patch: meetupCoordinationPatchFromRow(newRow),
              presenceChanged: false,
              coordinationChanged: true,
              coordinationChangedFields: ['synthetic_baseline_row_diff'],
              requiresImmediateRefresh: true,
            };
          }
        }
        logCoordinationSyncTrace('realtime_parsed', {
          surface,
          triggerSource,
          rentalId,
          parsed: Boolean(live),
          presenceChanged: live?.presenceChanged ?? false,
          coordinationChanged: live?.coordinationChanged ?? false,
          coordinationChangedFields: live?.coordinationChangedFields ?? [],
          requiresImmediateRefresh: live?.requiresImmediateRefresh ?? false,
          patch_pickup_datetime: live?.patch?.pickup_datetime ?? null,
          patch_meetup_location: live?.patch?.meetup_location ?? null,
          patch_last_proposed_by: live?.patch?.last_proposed_by ?? null,
          patch_proposal_version: live?.patch?.proposal_version ?? null,
        });

        if (live?.requiresImmediateRefresh) {
          const liveMeta: RentalWizardRealtimeSyncMeta = {
            ...meta,
            coordinationChangedFields: live.coordinationChangedFields,
          };
          if (optionsRef.current?.onRentalRowLivePatch) {
            optionsRef.current.onRentalRowLivePatch(live, liveMeta);
          } else {
            if (live.presenceChanged) {
              optionsRef.current?.onRentalPresencePatch?.(live.patch, liveMeta);
            }
            if (live.coordinationChanged) {
              optionsRef.current?.onRentalCoordinationPatch?.(live.patch, {
                ...liveMeta,
                changedFields: live.coordinationChangedFields,
              });
            }
          }
          if (live.presenceChanged) {
            runImmediateRefresh(liveMeta);
          } else if (live.coordinationChanged && !optionsRef.current?.onRentalRowLivePatch) {
            scheduleDebouncedRefresh(liveMeta);
          }
          return;
        }
        scheduleDebouncedRefresh(meta);
        return;
      }

      if (table === 'rental_wizard_state') {
        const wizPatch = extractRenterWizardHandoffPatch(
          payload as Parameters<typeof extractRenterWizardHandoffPatch>[0]
        );
        if (
          wizPatch?.renterPickupImHereAt ||
          wizPatch?.renterApprovedPickupPhotosAt ||
          wizPatch?.renterConfirmedPickupReceiptAt
        ) {
          optionsRef.current?.onRenterWizardHandoffPatch?.(wizPatch, meta);
          runImmediateRefresh(meta);
          return;
        }
        scheduleDebouncedRefresh(meta);
        return;
      }

      scheduleDebouncedRefresh(meta);
    },
    [rentalId, runImmediateRefresh, scheduleDebouncedRefresh, surface]
  );

  useEffect(() => {
    const id = rentalId.trim();
    if (!id) return;

    const supabase = getSupabase();
    const channelName = `rental-wizard-sync-${id}`;
    registerRentalRealtimeSubscription(id, channelName, surface);

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rentals', filter: `id=eq.${id}` },
        (payload) => handleChange('rentals_update', 'rentals', payload)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rental_wizard_state', filter: `rental_id=eq.${id}` },
        (payload) => handleChange('wizard_state_change', 'rental_wizard_state', payload)
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rental_verification_photos',
          filter: `rental_id=eq.${id}`,
        },
        (payload) => handleChange('pickup_evidence_change', 'rental_verification_photos', payload)
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rental_verifications',
          filter: `rental_id=eq.${id}`,
        },
        (payload) => handleChange('verification_row_change', 'rental_verifications', payload)
      )
      .subscribe((status) => {
        logScenario('realtime', {
          event: 'channel_status',
          rentalId: id,
          source: surface,
          status,
        });
      });

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      unregisterRentalRealtimeSubscription(id, surface);
      void supabase.removeChannel(channel);
    };
  }, [handleChange, rentalId, surface]);
}
