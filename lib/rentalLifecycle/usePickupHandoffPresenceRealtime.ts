import { useCallback, useEffect, useRef } from 'react';

import {
  extractRenterWizardHandoffPatch,
  logPickupHandoffLive,
  type PickupHandoffPresenceRentalPatch,
  type RenterWizardHandoffPatch,
} from '@/lib/pickupHandoffLive';
import {
  isRentalRealtimeSubscriptionActive,
  registerRentalRealtimeSubscription,
  unregisterRentalRealtimeSubscription,
} from '@/lib/rentalLifecycle/realtimeSubscriptionRegistry';
import {
  MEETUP_COORDINATION_RENTAL_FIELDS,
  meetupCoordinationFieldsDiffer,
  meetupCoordinationPatchFromRow,
} from '@/lib/rentalMeetupCoordinationLive';
import {
  parseRentalsLiveUpdate,
  type RentalsLiveUpdateResult,
} from '@/lib/rentalLifecycle/rentalRowLivePatch';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { logOwnerWorkspaceRealtimePipeline } from '@/lib/ownerWorkspaceRealtimePipeline';
import { logScenario } from '@/lib/rentalLifecycle/scenarioDevLog';
import { getSupabase } from '@/lib/supabase';

const DEFAULT_DEBOUNCE_MS = 120;

export type PickupHandoffPresenceRealtimeMeta = {
  triggerSource: string;
  table: string;
  receivedAt: number;
  coordinationChangedFields?: string[];
};

export type UsePickupHandoffPresenceRealtimeOptions = {
  /** Merged presence + meetup coordination patch (preferred — single setState). */
  onRentalRowLivePatch?: (
    live: RentalsLiveUpdateResult,
    meta: PickupHandoffPresenceRealtimeMeta
  ) => void;
  /** Called synchronously before background refresh (meetup-day live session). */
  onRentalPresencePatch?: (
    patch: PickupHandoffPresenceRentalPatch,
    meta: PickupHandoffPresenceRealtimeMeta
  ) => void;
  onRentalCoordinationPatch?: (
    patch: RentalsLiveUpdateResult['patch'],
    meta: PickupHandoffPresenceRealtimeMeta & { changedFields: string[] }
  ) => void;
  onRenterWizardHandoffPatch?: (
    patch: RenterWizardHandoffPatch,
    meta: PickupHandoffPresenceRealtimeMeta
  ) => void;
  /** Invoked immediately on live rentals UPDATE (0ms), after in-memory patch. */
  onPresenceRefresh?: (meta: PickupHandoffPresenceRealtimeMeta) => void | Promise<void>;
  /** Invoked for non-live or secondary tables (debounced). */
  onDebouncedRefresh?: (meta: PickupHandoffPresenceRealtimeMeta) => void | Promise<void>;
  debounceMs?: number;
  surface: string;
  /** Current open-screen rental row — enables coordination patch when payload.old is sparse. */
  getCoordinationBaseline?: () => Record<string, unknown> | null;
  /** DEV: viewer on the open details screen (for subscription/raw-realtime logs). */
  viewerUserId?: string | null;
  /** DEV: emit `[owner-workspace-*]` diagnostics (owner rental details screen). */
  ownerWorkspaceDevDiagnostics?: boolean;
  logLive?: (input: {
    meta: PickupHandoffPresenceRealtimeMeta;
    ownerArrived: boolean;
    renterArrived: boolean;
    bothPresent: boolean;
    previousPhase: string | null;
    nextPhase: string;
  }) => void;
};

/**
 * Live rental workspace channel: immediate patch + background refresh for
 * pickup handoff presence and meetup coordination proposal fields.
 */
export function usePickupHandoffPresenceRealtime(
  rentalId: string,
  options: UsePickupHandoffPresenceRealtimeOptions
): void {
  const optsRef = useRef(options);
  optsRef.current = options;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runImmediateRefresh = useCallback((meta: PickupHandoffPresenceRealtimeMeta) => {
    logScenario('realtime', {
      event: 'live_row_refresh_immediate',
      rentalId,
      source: options.surface,
      trigger: meta.triggerSource,
      table: meta.table,
    });
    void Promise.resolve(optsRef.current.onPresenceRefresh?.(meta));
  }, [options.surface, rentalId]);

  const scheduleDebouncedRefresh = useCallback(
    (meta: PickupHandoffPresenceRealtimeMeta) => {
      const ms = optsRef.current.debounceMs ?? DEFAULT_DEBOUNCE_MS;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        logScenario('realtime', {
          event: 'refresh_scheduled',
          rentalId,
          source: options.surface,
          trigger: meta.triggerSource,
          debounceMs: ms,
        });
        void Promise.resolve(optsRef.current.onDebouncedRefresh?.(meta));
      }, ms);
    },
    [options.surface, rentalId]
  );

  const handlePayload = useCallback(
    (triggerSource: string, table: string, payload: unknown) => {
      const receivedAt = Date.now();
      const meta: PickupHandoffPresenceRealtimeMeta = { triggerSource, table, receivedAt };

      if (table === 'rentals') {
        const rentalsPayload = payload as RealtimePostgresChangesPayload<Record<string, unknown>>;
        const coordinationBaseline = optsRef.current.getCoordinationBaseline?.() ?? null;
        const ownerPipeline = Boolean(optsRef.current.ownerWorkspaceDevDiagnostics);
        if (ownerPipeline) {
          logOwnerWorkspaceRealtimePipeline('handler_enter', {
            triggerSource,
            table,
            subscriptionRentalId: rentalId.trim(),
            baselineRentalId: coordinationBaseline?.id ?? null,
            payloadRentalId: (rentalsPayload.new as Record<string, unknown> | undefined)?.id ?? null,
          });
        }
        let live = parseRentalsLiveUpdate(rentalsPayload, {
          coordinationBaseline,
          ownerWorkspacePipelineLog: ownerPipeline,
          pipelineRentalId: rentalId.trim(),
        });
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
                surface: optsRef.current.surface,
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
            if (ownerPipeline) {
              logOwnerWorkspaceRealtimePipeline('synthetic_baseline_patch', {
                triggerSource,
                proposal_version: newRow.proposal_version ?? null,
              });
            }
          }
        }
        if (!live) {
          if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.log('[realtime-rentals-handler]', {
              event: 'rentals_update_no_live_delta',
              surface: optsRef.current.surface,
              triggerSource,
            });
          }
        }
        if (live?.requiresImmediateRefresh) {
          const liveMeta: PickupHandoffPresenceRealtimeMeta = {
            ...meta,
            coordinationChangedFields: live.coordinationChangedFields,
          };
          if (optsRef.current.onRentalRowLivePatch) {
            if (ownerPipeline) {
              logOwnerWorkspaceRealtimePipeline('live_patch_handler_invoked', {
                triggerSource,
                hydrationSource: 'realtime_patch',
                coordinationChanged: live.coordinationChanged,
                coordinationChangedFields: live.coordinationChangedFields,
              });
            }
            optsRef.current.onRentalRowLivePatch(live, liveMeta);
          } else {
            if (live.presenceChanged) {
              optsRef.current.onRentalPresencePatch?.(live.patch, liveMeta);
            }
            if (live.coordinationChanged) {
              optsRef.current.onRentalCoordinationPatch?.(live.patch, {
                ...liveMeta,
                changedFields: live.coordinationChangedFields,
              });
            }
          }
          /** Presence still needs a verification refresh; coordination uses in-memory patch only. */
          if (live.presenceChanged) {
            runImmediateRefresh(liveMeta);
          }
          return;
        }
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log('[realtime-rentals-handler]', {
            event: 'rentals_update_debounced_refresh',
            surface: optsRef.current.surface,
            triggerSource,
          });
        }
        if (ownerPipeline) {
          logOwnerWorkspaceRealtimePipeline('debounced_refresh_scheduled', { triggerSource });
        }
        scheduleDebouncedRefresh(meta);
        return;
      }

      if (table === 'rental_wizard_state') {
        const wizPatch = extractRenterWizardHandoffPatch(
          payload as Parameters<typeof extractRenterWizardHandoffPatch>[0]
        );
        if (wizPatch) {
          optsRef.current.onRenterWizardHandoffPatch?.(wizPatch, meta);
          runImmediateRefresh(meta);
          return;
        }
        scheduleDebouncedRefresh(meta);
        return;
      }

      scheduleDebouncedRefresh(meta);
    },
    [runImmediateRefresh, scheduleDebouncedRefresh]
  );

  const handlePayloadRef = useRef(handlePayload);
  handlePayloadRef.current = handlePayload;

  const logOwnerWorkspaceSubscriptionState = useCallback(
    (event: string, extra?: Record<string, unknown>) => {
      if (typeof __DEV__ === 'undefined' || !__DEV__) return;
      if (!optsRef.current.ownerWorkspaceDevDiagnostics) return;
      const id = rentalId.trim();
      const source = optsRef.current.surface;
      console.log('[owner-workspace-subscription-state]', {
        event,
        mounted: true,
        rentalId: id,
        viewerUserId: optsRef.current.viewerUserId ?? null,
        subscriptionSource: source,
        hasRealtimeSubscription: id ? isRentalRealtimeSubscriptionActive(id, source) : false,
        hasLivePatchHandler: Boolean(optsRef.current.onRentalRowLivePatch),
        rentalRowRefRentalId: optsRef.current.getCoordinationBaseline?.()?.id ?? null,
        subscriptionFilter: id ? `id=eq.${id}` : null,
        channelName: id ? `pickup-handoff-live:${id}:${source}` : null,
        ...extra,
      });
    },
    [rentalId]
  );

  useEffect(() => {
    const id = rentalId.trim();
    const source = optsRef.current.surface;
    const rentalsFilter = id ? `id=eq.${id}` : null;

    if (!id) {
      logOwnerWorkspaceSubscriptionState('effect_skip_empty_rental_id');
      return;
    }

    logOwnerWorkspaceSubscriptionState('effect_setup', {
      hasLivePatchHandler: Boolean(optsRef.current.onRentalRowLivePatch),
    });

    const supabase = getSupabase();
    const channelName = `pickup-handoff-live:${id}:${source}`;
    registerRentalRealtimeSubscription(id, channelName, source);

    const logOwnerRawRentalsPayload = (
      payload: RealtimePostgresChangesPayload<Record<string, unknown>>
    ) => {
      if (typeof __DEV__ === 'undefined' || !__DEV__) return;
      if (!optsRef.current.ownerWorkspaceDevDiagnostics) return;
      const newRow = payload.new as Record<string, unknown> | undefined;
      const oldRow = payload.old as Record<string, unknown> | undefined;
      const changedFields = MEETUP_COORDINATION_RENTAL_FIELDS.filter((key) =>
        String(oldRow?.[key] ?? '') !== String(newRow?.[key] ?? '')
      );
      logOwnerWorkspaceRealtimePipeline('raw_received', {
        trigger: 'rentals_postgres_changes',
        eventType: payload.eventType,
        payloadRentalId: newRow?.id ?? null,
        currentRentalId: id,
        viewerUserId: optsRef.current.viewerUserId ?? null,
        changedFields,
        coordinationFieldCount: changedFields.length,
        subscriptionFilter: rentalsFilter,
        channelName,
        hasRealtimeSubscription: isRentalRealtimeSubscriptionActive(id, source),
        proposal_version: newRow?.proposal_version ?? null,
        last_proposed_by: newRow?.last_proposed_by ?? null,
        meetup_time: newRow?.meetup_time ?? null,
        pickup_datetime: newRow?.pickup_datetime ?? null,
      });
      console.log('[owner-workspace-raw-realtime]', {
        trigger: 'rentals_postgres_changes',
        eventType: payload.eventType,
        payloadRentalId: newRow?.id ?? null,
        currentRentalId: id,
        viewerUserId: optsRef.current.viewerUserId ?? null,
        changedFields,
        coordinationFieldCount: changedFields.length,
        subscriptionFilter: rentalsFilter,
        channelName,
        proposal_version: newRow?.proposal_version ?? null,
        last_proposed_by: newRow?.last_proposed_by ?? null,
      });
    };

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rentals', filter: rentalsFilter! },
        (payload) => {
          logOwnerRawRentalsPayload(
            payload as RealtimePostgresChangesPayload<Record<string, unknown>>
          );
          handlePayloadRef.current('rentals_update', 'rentals', payload);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rental_wizard_state', filter: `rental_id=eq.${id}` },
        (payload) => handlePayloadRef.current('wizard_state_change', 'rental_wizard_state', payload)
      )
      .subscribe((status, err) => {
        if (optsRef.current.ownerWorkspaceDevDiagnostics && typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log('[owner-workspace-subscription-state]', {
            event: 'channel_subscribe_status',
            mounted: true,
            rentalId: id,
            viewerUserId: optsRef.current.viewerUserId ?? null,
            subscriptionSource: source,
            hasRealtimeSubscription: isRentalRealtimeSubscriptionActive(id, source),
            hasLivePatchHandler: Boolean(optsRef.current.onRentalRowLivePatch),
            rentalRowRefRentalId: optsRef.current.getCoordinationBaseline?.()?.id ?? null,
            subscriptionFilter: rentalsFilter,
            channelName,
            status,
            subscribeError: err?.message ?? null,
          });
        }
        logScenario('realtime', {
          event: 'pickup_handoff_channel_status',
          rentalId: id,
          source,
          status,
          subscribeError: err?.message ?? null,
        });
      });

    return () => {
      logOwnerWorkspaceSubscriptionState('effect_teardown');
      if (debounceRef.current) clearTimeout(debounceRef.current);
      unregisterRentalRealtimeSubscription(id, source);
      void supabase.removeChannel(channel);
    };
  }, [logOwnerWorkspaceSubscriptionState, rentalId]);
}
