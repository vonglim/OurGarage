import { useFocusEffect } from '@react-navigation/native';
import { Stack, useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import {
  CoordinationLiveBannerProvider,
  useCoordinationLiveBanner,
} from '@/components/rentalWizard/CoordinationLiveBannerContext';
import { OwnerRentalWizardProvider } from '@/components/ownerRentalWizard/OwnerRentalWizardProvider';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { useAuthUserId } from '@/lib/authUser';
import {
  applyOwnerRentalReceiptLivePatchToContext,
  applyOwnerRenterHandoffPatchToContext,
  buildOwnerRentalWizardContextWithDiagnostics,
  evaluateOwnerWizardNavigationWithLifecycleGate,
  resolveOwnerAuthorizationObserveAutoNavigatePath,
  resolveOwnerCoordinationTransitionAutoNavigatePath,
} from '@/lib/ownerRentalWizard';
import type { OwnerRentalWizardContext } from '@/lib/ownerRentalWizard/types';
import { isOwnerPickupEvidenceLocked } from '@/lib/pickupEvidenceLock';
import { processPendingOwnerWizardEvidenceUploads } from '@/lib/ownerWizardEvidenceFlow';
import { logRentalActivationSchema } from '@/lib/rentalActivationSchema';
import {
  logPickupHandoffLive,
  resolvePickupHandoffPresenceState,
  type LivePresencePhase,
} from '@/lib/pickupHandoffLive';
import { logScenario } from '@/lib/rentalLifecycle/scenarioDevLog';
import { useRentalWizardRealtimeSync } from '@/lib/rentalLifecycle/useRentalWizardRealtimeSync';
import {
  mergeWizardContextFromRentalLivePatch,
  type WizardCoordinationPatchRefs,
} from '@/lib/rentalWizard/applyWizardCoordinationLivePatch';
import { processCoordinationLiveSideEffects } from '@/lib/rentalWizard/processCoordinationLiveSideEffects';
import {
  extractCoordinationFreshnessMeta,
  type CoordinationFreshnessMeta,
} from '@/lib/meetupCoordinationFreshness';
import {
  createLifecyclePromptGateState,
  type WizardLifecyclePromptGateState,
  type WizardLifecyclePromptId,
} from '@/lib/rentalWizard/wizardLifecyclePromptGate';
import {
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

export default function OwnerRentalWizardLayout() {
  return (
    <CoordinationLiveBannerProvider>
      <OwnerRentalWizardLayoutContent />
    </CoordinationLiveBannerProvider>
  );
}

function OwnerRentalWizardLayoutContent() {
  const liveBanner = useCoordinationLiveBanner();
  const showCoordinationBannerRef = useRef(liveBanner?.showBanner);
  showCoordinationBannerRef.current = liveBanner?.showBanner;

  const { rentalId: rawId } = useLocalSearchParams<{ rentalId: string }>();
  const rentalId = typeof rawId === 'string' ? rawId : '';
  const pathname = usePathname();
  const router = useRouter();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const me = useAuthUserId();
  const [ctx, setCtx] = useState<OwnerRentalWizardContext | null>(null);
  const ctxRef = useRef<OwnerRentalWizardContext | null>(null);
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

  const armLifecyclePrompt = useCallback((id: WizardLifecyclePromptId) => {
    if (lifecycleGateRef.current === id) return;
    lifecycleGateRef.current = id;
    setLifecycleGate(createLifecyclePromptGateState(id));
  }, []);

  const refresh = useCallback(async () => {
    if (!rentalId) {
      setError('Missing rental.');
      setCtx(null);
      ctxRef.current = null;
      setLoading(false);
      return;
    }
    if (!me) return;

    try {
      const { ctx: next, buildError } = await buildOwnerRentalWizardContextWithDiagnostics(
        getSupabase(),
        rentalId,
        me
      );
      if (!next) {
        const message =
          buildError?.trim() || 'This rental is not available for the owner guide.';
        logRentalActivationSchema({
          rentalId,
          wizardBuildPhase: 'owner_wizard_layout_refresh',
          resolverCrashLocation: 'buildOwnerRentalWizardContext',
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
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load owner rental guide.';
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
      void refresh();
      const live = ctxRef.current;
      if (!live) return;
      void (async () => {
        const { uploadedCount } = await processPendingOwnerWizardEvidenceUploads({
          client: getSupabase(),
          rentalId: live.rentalId,
          ownerUserId: live.viewerUserId,
          renterUserId: live.rental.renter_user_id ?? '',
          pickupEvidenceLocked: isOwnerPickupEvidenceLocked(live.wizardProgress),
        });
        if (uploadedCount > 0) {
          await refresh();
        }
      })();
    }, [refresh])
  );

  useRentalWizardRealtimeSync(rentalId, refresh, {
    surface: 'owner_rental_wizard_layout',
    skipRefreshAfterHandoffWizardPatch: true,
    skipRefreshAfterRentalPresencePatch: (live) =>
      Boolean(live.patch.renter_confirmed_receipt_at) && !live.coordinationChanged,
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
          presentationSurface: 'owner_workspace',
          surfaceLabel: 'owner_rental_wizard',
          refs: patchRefs,
        });
        coordinationFreshnessRef.current = mergeResult.refs.freshness;
        coordinationRevisionRef.current = mergeResult.refs.revision;
        previousPickupCoordStatusRef.current = mergeResult.refs.previousPickupStatus;
        previousReturnCoordStatusRef.current = mergeResult.refs.previousReturnStatus;
        previousLivePhaseRef.current = mergeResult.refs.previousLivePhase;
        const receiptSynced = applyOwnerRentalReceiptLivePatchToContext(
          mergeResult.next as OwnerRentalWizardContext
        );
        ctxRef.current = receiptSynced;
        queueMicrotask(() => {
          processCoordinationLiveSideEffects({
            prev,
            next: receiptSynced,
            viewerUserId: me,
            rentalId,
            pathname: pathnameRef.current,
            triggerSource: meta.triggerSource,
            armLifecyclePrompt,
            showBanner: (banner) => showCoordinationBannerRef.current?.(banner),
          });
        });
        return receiptSynced;
      });
    },
    onRenterWizardHandoffPatch: (patch, meta) => {
      setCtx((prev) => {
        if (!prev) return prev;
        const next = applyOwnerRenterHandoffPatchToContext(prev, patch);
        const prevPresence = resolvePickupHandoffPresenceState({
          rental: prev.rental,
          renterPickupImHereAt: prev.wizardProgress.renter_pickup_im_here_at,
          renterApprovedPickupPhotosAt: prev.wizardProgress.renter_approved_pickup_photos_at,
          pickupAck: prev.pickupAck,
          ownerPickupPrepComplete: true,
          handoffApprovalStarted: Boolean(
            prev.rental.handoff_approval_started_at?.trim() || prev.rental.handoff_approved_by_owner
          ),
          handoffCompleted: prev.pickupHandoffComplete,
          viewerRole: 'owner',
        });
        const nextPresence = resolvePickupHandoffPresenceState({
          rental: next.rental,
          renterPickupImHereAt: next.wizardProgress.renter_pickup_im_here_at,
          renterApprovedPickupPhotosAt: next.wizardProgress.renter_approved_pickup_photos_at,
          pickupAck: next.pickupAck,
          ownerPickupPrepComplete: true,
          handoffApprovalStarted: Boolean(
            next.rental.handoff_approval_started_at?.trim() || next.rental.handoff_approved_by_owner
          ),
          handoffCompleted: next.pickupHandoffComplete,
          viewerRole: 'owner',
        });
        logPickupHandoffLive({
          rentalId,
          triggerSource: meta.triggerSource,
          rerenderedSurface: 'owner_rental_wizard',
          ownerArrived: nextPresence.ownerArrived,
          renterArrived: nextPresence.renterArrived,
          bothPresent: nextPresence.bothPresent,
          previousPresenceState: previousLivePhaseRef.current ?? prevPresence.livePresencePhase,
          nextPresenceState: nextPresence.livePresencePhase,
          latencyMs: Date.now() - meta.receivedAt,
        });
        previousLivePhaseRef.current = nextPresence.livePresencePhase;
        ctxRef.current = next;
        return next;
      });
    },
  });

  useEffect(() => {
    if (!ctx || loading) return;
    const nextPath =
      resolveOwnerCoordinationTransitionAutoNavigatePath(ctx, pathname) ??
      resolveOwnerAuthorizationObserveAutoNavigatePath(ctx, pathname);
    if (nextPath) {
      if (lifecycleGateRef.current != null) {
        clearLifecyclePromptGate();
      }
      logScenario('lifecycle', {
        event: 'owner_auto_advance_wizard',
        rentalId: ctx.rentalId,
        from: pathname,
        to: nextPath,
      });
      router.replace(nextPath as `/owner-rental-wizard/${string}/s/${string}`);
    }
  }, [clearLifecyclePromptGate, ctx, loading, pathname, router]);

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
    <OwnerRentalWizardProvider
      ctx={ctx}
      onRefresh={refresh}
      lifecycleGate={lifecycleGate}
      onClearLifecyclePrompt={clearLifecyclePromptGate}
    >
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
    </OwnerRentalWizardProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { fontSize: 15, color: ui.textSecondary, textAlign: 'center' },
});
