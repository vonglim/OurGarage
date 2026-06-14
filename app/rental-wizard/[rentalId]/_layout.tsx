import { useFocusEffect } from '@react-navigation/native';
import { Stack, useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { CoordinationLiveBannerProvider, useCoordinationLiveBanner } from '@/components/rentalWizard/CoordinationLiveBannerContext';
import { RentalWizardProvider } from '@/components/rentalWizard/RentalWizardProvider';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { useAuthUserId } from '@/lib/authUser';
import {
  buildOwnerRentalWizardContextWithDiagnostics,
  resolveOwnerRentalWizardDestination,
} from '@/lib/ownerRentalWizard';
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

import { useRentalWizardRealtimeSync } from '@/lib/rentalLifecycle/useRentalWizardRealtimeSync';
import {
  mergeWizardContextFromRentalLivePatch,
  type WizardCoordinationPatchRefs,
} from '@/lib/rentalWizard/applyWizardCoordinationLivePatch';
import { processCoordinationLiveSideEffects } from '@/lib/rentalWizard/processCoordinationLiveSideEffects';
import { processPickupEvidenceLiveSideEffects } from '@/lib/rentalWizard/processPickupEvidenceLiveSideEffects';
import {
  coordinationSyncSnapshotFromRow,
  logCoordinationSyncTrace,
} from '@/lib/rentalWizard/coordinationSyncDevLog';
import {
  extractCoordinationFreshnessMeta,
  type CoordinationFreshnessMeta,
} from '@/lib/meetupCoordinationFreshness';
import { logScenario } from '@/lib/rentalLifecycle/scenarioDevLog';
import { resolveRenterPickupInspectionAutoNavigatePath } from '@/lib/pickupHandoffWizardSync';
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
  return (
    <CoordinationLiveBannerProvider>
      <RentalWizardLayoutContent />
    </CoordinationLiveBannerProvider>
  );
}

function RentalWizardLayoutContent() {
  const liveBanner = useCoordinationLiveBanner();
  const showCoordinationBannerRef = useRef(liveBanner?.showBanner);
  showCoordinationBannerRef.current = liveBanner?.showBanner;
  const router = useRouter();
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
  const prevCtxForEvidenceRef = useRef<RentalWizardContext | null>(null);

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
        if (message.includes('not available for the guided flow')) {
          const ownerResult = await buildOwnerRentalWizardContextWithDiagnostics(
            supabase,
            rentalId,
            me
          );
          if (ownerResult.ctx) {
            const dest = resolveOwnerRentalWizardDestination(ownerResult.ctx);
            if (dest.path) {
              logScenario('routing', {
                event: 'renter_wizard_redirect_owner',
                rentalId,
                source: 'wizard_layout',
                path: dest.path,
              });
              router.replace(dest.path as `/owner-rental-wizard/${string}/s/${string}`);
              return;
            }
          }
        }
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
        logCoordinationSyncTrace('wizard_layout_ctx', {
          source: 'refresh_end',
          rentalId,
          ...coordinationSyncSnapshotFromRow(next.rental as Record<string, unknown>, next.meetupCoordination),
        });
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
  }, [me, rentalId, router]);

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
    onRentalRowLivePatch: (live, meta) => {
      setCtx((prev) => {
        if (!prev) return prev;
        const patchRefs: WizardCoordinationPatchRefs = {
          freshness: coordinationFreshnessRef.current,
          revision: coordinationRevisionRef.current,
          previousPickupStatus: previousPickupCoordStatusRef.current,
          previousReturnStatus: previousReturnCoordStatusRef.current,
          previousLivePhase: previousLivePhaseRef.current,
        };
        const mergeResult = mergeWizardContextFromRentalLivePatch({
          prev,
          live,
          triggerSource: meta.triggerSource,
          receivedAt: meta.receivedAt,
          rentalId,
          viewerUserId: me,
          presentationSurface: 'renter_wizard',
          surfaceLabel: 'rental_wizard',
          refs: patchRefs,
        });
        coordinationFreshnessRef.current = mergeResult.refs.freshness;
        coordinationRevisionRef.current = mergeResult.refs.revision;
        previousPickupCoordStatusRef.current = mergeResult.refs.previousPickupStatus;
        previousReturnCoordStatusRef.current = mergeResult.refs.previousReturnStatus;
        previousLivePhaseRef.current = mergeResult.refs.previousLivePhase;
        ctxRef.current = mergeResult.next;
        queueMicrotask(() => {
          processCoordinationLiveSideEffects({
            prev,
            next: mergeResult.next,
            viewerUserId: me,
            rentalId,
            pathname: pathnameRef.current,
            triggerSource: meta.triggerSource,
            armLifecyclePrompt,
            showBanner: (banner) => showCoordinationBannerRef.current?.(banner),
          });
        });
        return mergeResult.next;
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
    if (!ctx) return;
    processPickupEvidenceLiveSideEffects({
      prev: prevCtxForEvidenceRef.current,
      next: ctx,
      pathname: pathnameRef.current,
      armLifecyclePrompt,
    });
    prevCtxForEvidenceRef.current = ctx;
  }, [armLifecyclePrompt, ctx]);

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
      showCoordinationBanner: (banner) => showCoordinationBannerRef.current?.(banner),
      refreshWizard: () => void refresh(),
    });
    return () => unregisterWizardMeetupPromptSession(rentalId);
  }, [armLifecyclePrompt, refresh, rentalId]);

  useEffect(() => {
    lifecycleGateRef.current = null;
    setLifecycleGate(createLifecyclePromptGateState(null));
  }, [rentalId]);

  useEffect(() => {
    if (!ctx || loading) return;
    const nextPath = resolveRenterPickupInspectionAutoNavigatePath(ctx, pathname);
    if (nextPath) {
      logScenario('lifecycle', {
        event: 'renter_auto_advance_inspection',
        rentalId: ctx.rentalId,
        from: pathname,
        to: nextPath,
      });
      router.replace(nextPath as `/rental-wizard/${string}/s/${string}`);
    }
  }, [ctx, loading, pathname, router]);

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
