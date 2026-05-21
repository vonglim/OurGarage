import { useFocusEffect } from '@react-navigation/native';
import { Stack, useLocalSearchParams, usePathname } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { RentalWizardProvider } from '@/components/rentalWizard/RentalWizardProvider';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { useAuthUserId } from '@/lib/authUser';
import { buildRentalWizardContextWithDiagnostics } from '@/lib/rentalWizard/buildRentalWizardContext';
import { logRentalActivationSchema } from '@/lib/rentalActivationSchema';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';
import { DEV_TOOLS_ENABLED } from '@/lib/devTools/gates';
import { registerRentalDevContext, unregisterRentalDevContext } from '@/lib/rentalSimulation';
import {
  logPickupHandoffLive,
  resolvePickupHandoffPresenceState,
  type LivePresencePhase,
} from '@/lib/pickupHandoffLive';
import type { RentalsLiveUpdateResult } from '@/lib/rentalLifecycle/rentalRowLivePatch';
import { useRentalWizardRealtimeSync } from '@/lib/rentalLifecycle/useRentalWizardRealtimeSync';
import {
  extractCoordinationFreshnessMeta,
  mergeRentalRowFromRealtimeCoordinationPatch,
  patchContainsMeetupCoordinationFields,
  type CoordinationFreshnessMeta,
} from '@/lib/meetupCoordinationFreshness';
import {
  buildReturnCoordinationLiveDiagnostics,
  logPickupCoordinationLive,
  logPickupCoordinationLiveReturn,
  snapshotMeetupCoordinationStatuses,
} from '@/lib/rentalMeetupCoordinationLive';
import {
  recomputeCanonicalMeetupCoordination,
  roleForViewerOnRental,
} from '@/lib/canonicalMeetupCoordination';
import type { RentalMeetupRow } from '@/lib/rentalMeetupProposalLifecycle';
import { buildRentalWizardContextFlags } from '@/lib/rentalWizard/rentalWizardContextFlags';
import { logScenario } from '@/lib/rentalLifecycle/scenarioDevLog';
import {
  createLifecyclePromptGateState,
  type WizardLifecyclePromptGateState,
  type WizardLifecyclePromptId,
} from '@/lib/rentalWizard/wizardLifecyclePromptGate';
import {
  logWizardNotificationPrompt,
  logWizardReturnPrompt,
  registerWizardMeetupPromptSession,
  syncReturnProposalWaitingLatch,
  unregisterWizardMeetupPromptSession,
} from '@/lib/rentalWizard/wizardLifecyclePromptFromNotification';
import { getSupabase } from '@/lib/supabase';
import { ui } from '@/constants/appUi';

function isOnCoordinatePickupPath(pathname: string): boolean {
  return pathname.includes('/s/coordinate-pickup') || pathname.includes('/coordinate-pickup');
}

function isOnCoordinateReturnPath(pathname: string): boolean {
  return pathname.includes('/s/coordinate-return') || pathname.includes('/coordinate-return');
}

export default function RentalWizardLayout() {
  const { rentalId: rawId } = useLocalSearchParams<{ rentalId: string }>();
  const rentalId = typeof rawId === 'string' ? rawId : '';
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const me = useAuthUserId();
  const [ctx, setCtx] = useState<RentalWizardContext | null>(null);
  const ctxRef = useRef<RentalWizardContext | null>(null);
  const lifecycleGateRef = useRef<WizardLifecyclePromptId | null>(null);
  const [lifecycleGate, setLifecycleGate] = useState<WizardLifecyclePromptGateState>(() =>
    createLifecyclePromptGateState(null)
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const previousLivePhaseRef = useRef<LivePresencePhase | null>(null);
  const previousPickupCoordStatusRef = useRef<string | null>(null);
  const previousReturnCoordStatusRef = useRef<string | null>(null);
  const coordinationFreshnessRef = useRef<CoordinationFreshnessMeta>({
    proposal_version: 0,
    proposal_updated_at: null,
    coordination_revision: 0,
    source: 'fetch_refresh',
  });
  const coordinationRevisionRef = useRef(0);

  const clearLifecyclePromptGate = useCallback(() => {
    lifecycleGateRef.current = null;
    setLifecycleGate(createLifecyclePromptGateState(null));
  }, []);

  const armLifecyclePrompt = useCallback(
    (id: WizardLifecyclePromptId) => {
      if (lifecycleGateRef.current === id) return;
      lifecycleGateRef.current = id;
      setLifecycleGate(createLifecyclePromptGateState(id));
    },
    []
  );

  const refresh = useCallback(async () => {
    if (!rentalId) {
      setError('Missing rental.');
      setCtx(null);
      ctxRef.current = null;
      setLoading(false);
      return;
    }
    if (!me) {
      return;
    }

    logScenario('lifecycle', {
      event: 'refresh_start',
      rentalId,
      source: 'wizard_layout',
      hasPrevCtx: Boolean(ctxRef.current),
      lifecycleGateActive: lifecycleGateRef.current,
    });

    try {
      const supabase = getSupabase();
      const { ctx: next, buildError } = await buildRentalWizardContextWithDiagnostics(
        supabase,
        rentalId,
        me
      );

      if (!next) {
        const message =
          buildError?.trim() || 'This rental is not available for the guided flow.';
        logRentalActivationSchema({
          rentalId,
          wizardBuildPhase: 'wizard_layout_refresh',
          resolverCrashLocation: 'buildRentalWizardContext',
          error: message,
        });
        setError(message);
        setCtx(null);
        ctxRef.current = null;
      } else {
        coordinationFreshnessRef.current = extractCoordinationFreshnessMeta(next.rental, {
          source: 'fetch_refresh',
          coordination_revision: next.meetupCoordination.revision,
        });
        coordinationRevisionRef.current = next.meetupCoordination.revision;
        setCtx(next);
        ctxRef.current = next;
        setError(null);
        logScenario('lifecycle', {
          event: 'refresh_end',
          rentalId,
          source: 'wizard_layout',
          hasCtx: true,
          lifecycleGateActive: lifecycleGateRef.current,
          schemaDegraded: next.schemaDegraded ?? false,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load rental wizard.';
      logRentalActivationSchema({
        rentalId,
        wizardBuildPhase: 'wizard_layout_refresh',
        resolverCrashLocation: 'refresh_uncaught',
        error: message,
      });
      setError(message);
      setCtx(null);
      ctxRef.current = null;
    } finally {
      setLoading(false);
    }
  }, [me, rentalId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      logScenario('lifecycle', { event: 'focus_refresh', rentalId, source: 'wizard_layout' });
      void refresh();
    }, [refresh, rentalId])
  );

  useRentalWizardRealtimeSync(rentalId, refresh, {
    surface: 'rental_wizard_layout',
    getCoordinationBaseline: () =>
      ctxRef.current?.rental ? (ctxRef.current.rental as Record<string, unknown>) : null,
    onRentalRowLivePatch: (live: RentalsLiveUpdateResult, meta) => {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log('[renter-wizard-realtime-patch]', {
          triggerSource: meta.triggerSource,
          coordinationChanged: live.coordinationChanged,
          coordinationChangedFields: live.coordinationChangedFields,
          patchHasCoordinationFields: patchContainsMeetupCoordinationFields(live.patch),
        });
      }
      setCtx((prev) => {
        if (!prev) return prev;
        const shouldMergeCoordination =
          live.coordinationChanged || patchContainsMeetupCoordinationFields(live.patch);
        const mergeResult = shouldMergeCoordination
          ? mergeRentalRowFromRealtimeCoordinationPatch({
              baseline: prev.rental,
              patch: live.patch,
              baselineMeta: coordinationFreshnessRef.current,
              coordinationRevision: coordinationRevisionRef.current,
              surface: 'renter_wizard',
            })
          : null;
        const nextRental = (
          mergeResult ? mergeResult.merged : { ...prev.rental, ...live.patch }
        ) as typeof prev.rental;
        if (mergeResult) {
          coordinationFreshnessRef.current = mergeResult.meta;
          if (mergeResult.shouldBumpRevision) {
            coordinationRevisionRef.current = mergeResult.meta.coordination_revision;
          }
        }
        const wizardFlags = buildRentalWizardContextFlags(nextRental);
        const prevCoord = snapshotMeetupCoordinationStatuses({
          rental: prev.rental,
          viewerUserId: me,
          requestSchedulingMeta: prev.requestSchedulingMeta,
          pickupHandoffComplete: prev.pickupHandoffComplete,
        });
        const nextCoord = snapshotMeetupCoordinationStatuses({
          rental: nextRental,
          viewerUserId: me,
          requestSchedulingMeta: prev.requestSchedulingMeta,
          pickupHandoffComplete: prev.pickupHandoffComplete,
        });

        if (live.coordinationChanged) {
          const previousReturnStatus =
            (previousReturnCoordStatusRef.current as typeof nextCoord.returnStatus) ??
            prevCoord.returnStatus;
          logPickupCoordinationLive({
            rentalId,
            triggerSource: meta.triggerSource,
            triggeredBy: String(nextRental.last_proposed_by ?? live.patch.last_proposed_by ?? ''),
            changedFields: live.coordinationChangedFields,
            previousPickupStatus:
              (previousPickupCoordStatusRef.current as typeof nextCoord.pickupStatus) ??
              prevCoord.pickupStatus,
            nextPickupStatus: nextCoord.pickupStatus,
            previousReturnStatus,
            nextReturnStatus: nextCoord.returnStatus,
            latencyMs: Date.now() - meta.receivedAt,
            surface: 'rental_wizard',
          });
          logPickupCoordinationLiveReturn({
            rentalId,
            triggerSource: meta.triggerSource,
            triggeredBy: String(nextRental.last_proposed_by ?? live.patch.last_proposed_by ?? ''),
            changedFields: live.coordinationChangedFields,
            latencyMs: Date.now() - meta.receivedAt,
            surface: 'rental_wizard',
            diagnostics: buildReturnCoordinationLiveDiagnostics({
              rental: nextRental,
              viewerUserId: me,
              requestSchedulingMeta: prev.requestSchedulingMeta,
              pickupHandoffComplete: prev.pickupHandoffComplete,
              previousReturnStatus,
            }),
          });
          previousPickupCoordStatusRef.current = nextCoord.pickupStatus;
          previousReturnCoordStatusRef.current = nextCoord.returnStatus;
        }

        if (live.presenceChanged) {
          const prevPresence = resolvePickupHandoffPresenceState({
            rental: prev.rental,
            renterPickupImHereAt: prev.wizardProgress.renter_pickup_im_here_at,
            renterApprovedPickupPhotosAt: prev.wizardProgress.renter_approved_pickup_photos_at,
            pickupAck: prev.pickupAck,
            ownerPickupPrepComplete: false,
            handoffApprovalStarted: Boolean(
              prev.rental.handoff_approval_started_at?.trim() ||
                prev.rental.handoff_approved_by_owner
            ),
            handoffCompleted: prev.pickupHandoffComplete,
            viewerRole: 'renter',
          });
          const nextPresence = resolvePickupHandoffPresenceState({
            rental: nextRental,
            renterPickupImHereAt: prev.wizardProgress.renter_pickup_im_here_at,
            renterApprovedPickupPhotosAt: prev.wizardProgress.renter_approved_pickup_photos_at,
            pickupAck: prev.pickupAck,
            ownerPickupPrepComplete: false,
            handoffApprovalStarted: Boolean(
              nextRental.handoff_approval_started_at?.trim() ||
                nextRental.handoff_approved_by_owner
            ),
            handoffCompleted: prev.pickupHandoffComplete,
            viewerRole: 'renter',
          });
          logPickupHandoffLive({
            rentalId,
            triggerSource: meta.triggerSource,
            rerenderedSurface: 'rental_wizard',
            ownerArrived: nextPresence.ownerArrived,
            renterArrived: nextPresence.renterArrived,
            bothPresent: nextPresence.bothPresent,
            previousPresenceState:
              previousLivePhaseRef.current ?? prevPresence.livePresencePhase,
            nextPresenceState: nextPresence.livePresencePhase,
            latencyMs: Date.now() - meta.receivedAt,
          });
          previousLivePhaseRef.current = nextPresence.livePresencePhase;
        }

        const viewerRole = roleForViewerOnRental(nextRental as RentalMeetupRow, me);
        const meetupCoordination = recomputeCanonicalMeetupCoordination({
          rental: nextRental as RentalMeetupRow,
          viewerUserId: me,
          viewerRole,
          presentationSurface: viewerRole === 'owner' ? 'owner_workspace' : 'renter_wizard',
          requestSchedulingMeta: prev.requestSchedulingMeta,
          pickupHandoffComplete: prev.pickupHandoffComplete,
          previousRevision: prev.meetupCoordination.revision,
          bumpRevision:
            live.coordinationChanged &&
            (mergeResult?.shouldBumpRevision ?? true),
        });
        const next = {
          ...prev,
          rental: nextRental,
          meetupCoordination,
          hasPendingProposal: meetupCoordination.hasPendingProposal,
          pickupCoordinationComplete: meetupCoordination.pickupCoordinationComplete,
          returnCoordinationAgreed: meetupCoordination.returnCoordinationComplete,
          meetupCoordinationComplete: meetupCoordination.meetupCoordinationComplete,
          pickupIso: meetupCoordination.pickupIso,
          returnIso: meetupCoordination.returnIso,
          meetingCompleted: wizardFlags.meetingCompleted,
          meetingAgreementCleared: wizardFlags.meetingAgreementCleared,
        };
        ctxRef.current = next;
        return next;
      });
    },
    onRenterWizardHandoffPatch: (patch, meta) => {
      setCtx((prev) => {
        if (!prev) return prev;
        const nextProgress = {
          ...prev.wizardProgress,
          ...(patch.renterPickupImHereAt != null
            ? { renter_pickup_im_here_at: patch.renterPickupImHereAt }
            : {}),
          ...(patch.renterApprovedPickupPhotosAt != null
            ? { renter_approved_pickup_photos_at: patch.renterApprovedPickupPhotosAt }
            : {}),
          ...(patch.renterConfirmedPickupReceiptAt != null
            ? { renter_confirmed_pickup_receipt_at: patch.renterConfirmedPickupReceiptAt }
            : {}),
        };
        const prevPresence = resolvePickupHandoffPresenceState({
          rental: prev.rental,
          renterPickupImHereAt: prev.wizardProgress.renter_pickup_im_here_at,
          renterApprovedPickupPhotosAt: prev.wizardProgress.renter_approved_pickup_photos_at,
          pickupAck: prev.pickupAck,
          ownerPickupPrepComplete: false,
          handoffApprovalStarted: Boolean(
            prev.rental.handoff_approval_started_at?.trim() || prev.rental.handoff_approved_by_owner
          ),
          handoffCompleted: prev.pickupHandoffComplete,
          viewerRole: 'renter',
        });
        const nextPresence = resolvePickupHandoffPresenceState({
          rental: prev.rental,
          renterPickupImHereAt: nextProgress.renter_pickup_im_here_at,
          renterApprovedPickupPhotosAt: nextProgress.renter_approved_pickup_photos_at,
          pickupAck: prev.pickupAck,
          ownerPickupPrepComplete: false,
          handoffApprovalStarted: Boolean(
            prev.rental.handoff_approval_started_at?.trim() || prev.rental.handoff_approved_by_owner
          ),
          handoffCompleted: prev.pickupHandoffComplete,
          viewerRole: 'renter',
        });
        logPickupHandoffLive({
          rentalId,
          triggerSource: meta.triggerSource,
          rerenderedSurface: 'rental_wizard',
          ownerArrived: nextPresence.ownerArrived,
          renterArrived: nextPresence.renterArrived,
          bothPresent: nextPresence.bothPresent,
          previousPresenceState: previousLivePhaseRef.current ?? prevPresence.livePresencePhase,
          nextPresenceState: nextPresence.livePresencePhase,
          latencyMs: Date.now() - meta.receivedAt,
        });
        previousLivePhaseRef.current = nextPresence.livePresencePhase;
        const next = { ...prev, wizardProgress: nextProgress };
        ctxRef.current = next;
        return next;
      });
    },
  });

  useEffect(() => {
    if (!rentalId || !me || !ctx) return;
    syncReturnProposalWaitingLatch({
      rentalId,
      viewerUserId: me,
      onCoordinateReturn: isOnCoordinateReturnPath(pathname),
      hasPendingProposal: ctx.hasPendingProposal,
      lastProposedBy: String(ctx.rental.last_proposed_by ?? '').trim() || null,
      pickupConfirmedSeen: ctx.seenTransitions.has('pickup_confirmed_seen'),
      returnConfirmedSeen: ctx.seenTransitions.has('return_confirmed_seen'),
    });
  }, [ctx, me, pathname, rentalId]);

  useEffect(() => {
    if (!rentalId) return;
    registerWizardMeetupPromptSession({
      rentalId,
      isOnCoordinatePickup: () => isOnCoordinatePickupPath(pathnameRef.current),
      isOnCoordinateReturn: () => isOnCoordinateReturnPath(pathnameRef.current),
      getCtx: () => ctxRef.current,
      isGateActive: () => lifecycleGateRef.current != null,
      armPickupAcceptedPrompt: () => armLifecyclePrompt('pickup_coordination_accepted'),
      armReturnAcceptedPrompt: () => armLifecyclePrompt('return_coordination_accepted'),
    });
    return () => unregisterWizardMeetupPromptSession(rentalId);
  }, [armLifecyclePrompt, rentalId]);

  useEffect(() => {
    lifecycleGateRef.current = null;
    setLifecycleGate(createLifecyclePromptGateState(null));
  }, [rentalId]);

  const simulatePickupAcceptedOverlay = useCallback(() => {
    if (!rentalId) return;
    armLifecyclePrompt('pickup_coordination_accepted');
    logWizardNotificationPrompt(rentalId, 'notification_prompt_armed', {
      source: 'dev_toolkit',
      promptId: 'pickup_coordination_accepted',
    });
  }, [armLifecyclePrompt, rentalId]);

  const simulateReturnAcceptedOverlay = useCallback(() => {
    if (!rentalId) return;
    armLifecyclePrompt('return_coordination_accepted');
    logWizardReturnPrompt(rentalId, 'return_prompt_armed', {
      source: 'dev_toolkit',
      promptId: 'return_coordination_accepted',
    });
  }, [armLifecyclePrompt, rentalId]);

  useEffect(() => {
    if (!DEV_TOOLS_ENABLED || !rentalId || !ctx) return;
    registerRentalDevContext({
      rentalId,
      pathname,
      source: 'rental_wizard',
      refresh,
      wizardCtx: ctx,
      simulatePickupAcceptedOverlay,
      simulateReturnAcceptedOverlay,
    });
    return () => unregisterRentalDevContext(rentalId);
  }, [ctx, pathname, refresh, rentalId, simulatePickupAcceptedOverlay, simulateReturnAcceptedOverlay]);

  if (loading) {
    return (
      <ScreenWrapper style={styles.center}>
        <ActivityIndicator color={ui.primary} />
      </ScreenWrapper>
    );
  }

  if (!ctx || error) {
    return (
      <ScreenWrapper style={styles.center}>
        <Text style={styles.error}>{error ?? 'Unable to load rental.'}</Text>
      </ScreenWrapper>
    );
  }

  return (
    <RentalWizardProvider
      ctx={ctx}
      onRefresh={refresh}
      lifecycleGate={lifecycleGate}
      onClearLifecyclePrompt={clearLifecyclePromptGate}
    >
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
    </RentalWizardProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { fontSize: 15, color: ui.textSecondary, textAlign: 'center' },
});
