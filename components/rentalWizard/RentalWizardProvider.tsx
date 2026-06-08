import { useRouter } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { GuidedRentalWizardBindingsProvider } from '@/components/rentalWizard/GuidedRentalWizardBindingsContext';
import { WizardLifecyclePromptHost } from '@/components/rentalWizard/WizardLifecyclePromptHost';
import {
  clearCoordinateReturnDraft,
  markWizardTransitionSeen,
  resolveRentalWizardDestination,
  updateWizardProgress,
  wizardPathForStep,
} from '@/lib/rentalWizard';
import type { RentalWizardContext, RentalWizardStep } from '@/lib/rentalWizard/types';
import { transitionKeyForStep } from '@/lib/rentalWizard/rentalWizardTransitionResolver';
import { WIZARD_STEP_META } from '@/lib/rentalWizard/wizardStepMeta';
import {
  resolveAcceptedMeetupLocation,
  resolveAcceptedRentalPickupIso,
} from '@/lib/rentalWizard/acceptedPickupCoordination';
import { submitRentalMeetupProposal } from '@/lib/rentalWizard/submitRentalMeetupProposal';
import { acceptRentalMeetupProposal } from '@/lib/rentalMeetupProposalLifecycle';
import { saveReturnCoordinationToRental } from '@/lib/rentalWizard/saveReturnCoordination';
import {
  resolveProposalReturnIsoForPickup,
  viewerLastMeetupSubmissionPatch,
  type WizardMeetupProposalDraft,
} from '@/lib/rentalWizard/wizardMeetupDraft';
import {
  evaluateWizardNavigationWithLifecycleGate,
  hasPendingWizardLifecyclePrompt,
  type WizardLifecyclePromptGateState,
  type WizardLifecyclePromptId,
} from '@/lib/rentalWizard/wizardLifecyclePromptGate';
import {
  logWizardNotificationPrompt,
  logWizardReturnPrompt,
} from '@/lib/rentalWizard/wizardLifecyclePromptFromNotification';
import { computeOwnerPickupEvidenceRevision } from '@/lib/rentalPickupViewerFlags';
import { markRenterPickupArrived } from '@/lib/pickupHandoffArrival';
import { buildRentalAgreementText } from '@/lib/rentalAuthorization/agreementSections';
import {
  persistDigitalSignature,
  persistEquipmentConditionAcknowledgment,
  persistLiabilityDisclosures,
  persistRentalActivation,
  persistRentalAgreementReview,
  persistSecurityHoldAuthorization,
  type LiabilityDisclosureInput,
} from '@/lib/rentalAuthorization/rentalAuthorizationActions';
import {
  patchAgreementReviewOnCtx,
  patchDigitalSignatureOnCtx,
  patchLiabilityDisclosuresOnCtx,
  patchSecurityHoldOnCtx,
} from '@/lib/rentalAuthorization/patchAuthorizationCtx';
import { resolveAuthorizationWizardStep } from '@/lib/rentalAuthorization/resolveAuthorizationWizardStep';
import { calculatePreauthAmount } from '@/lib/rentalProtection';
import { normalizeLegalName } from '@/lib/legalName';
import { evaluatePickupInspectionFlow } from '@/lib/pickupInspectionFlow';
import { persistRenterConfirmedPickupReceipt } from '@/lib/pickupHandoffMilestones';
import {
  deriveWizardRenterViewerFlags,
  manualRenterPickupMapOnly,
  renterPickupManualFromVerificationRows,
  RENTER_PICKUP_ITEMS,
} from '@/lib/rentalPickupChecklist';
import {
  ensureVerificationRows,
  persistChecklistState,
} from '@/lib/rentalVerification';
import { logScenario } from '@/lib/rentalLifecycle/scenarioDevLog';
import {
  coordinationSyncSnapshotFromCtx,
  logCoordinationSyncTrace,
} from '@/lib/rentalWizard/coordinationSyncDevLog';
import { getSupabase } from '@/lib/supabase';

type RentalWizardContextValue = {
  ctx: RentalWizardContext;
  refresh: () => Promise<void>;
  proposalBusy: boolean;
  lifecycleGate: WizardLifecyclePromptGateState;
  lifecyclePromptId: WizardLifecyclePromptId | null;
  hasPendingLifecyclePrompt: boolean;
  /** @deprecated Use hasPendingLifecyclePrompt — same gate blocks step correction. */
  holdStepAutoCorrection: boolean;
  acknowledgeLifecyclePrompt: (id: WizardLifecyclePromptId) => Promise<void>;
  goToWizardStep: (step: RentalWizardStep) => void;
  openMessages: () => void;
  openAdvancedDetails: (focus?: string) => void;
  submitCoordinatePickupProposal: (draft: WizardMeetupProposalDraft) => Promise<boolean>;
  acceptCoordinatePickupProposal: () => Promise<boolean>;
  submitCoordinateReturnProposal: (draft: WizardMeetupProposalDraft) => Promise<boolean>;
  acknowledgeReturnCoordination: () => Promise<void>;
  completeReturnCoordination: (draft: WizardMeetupProposalDraft) => Promise<boolean>;
  advanceAfterTransition: (fromStep: RentalWizardStep) => Promise<void>;
  goToResolvedNext: () => Promise<void>;
  confirmPickupReceipt: () => Promise<void>;
  toggleRenterPickupChecklistItem: (itemId: string) => Promise<void>;
  markViewedTimestampProof: () => Promise<void>;
  markImHerePickup: () => Promise<boolean>;
  markImHereReturn: () => Promise<boolean>;
  arrivalActionBusy: boolean;
  authorizationBusy: boolean;
  completeRentalAgreementStep: (input: {
    equipmentConditionAcknowledged: boolean;
  }) => Promise<boolean>;
  completeUnifiedAgreementReview: () => Promise<boolean>;
  completeLiabilityDisclosuresStep: (input: LiabilityDisclosureInput) => Promise<boolean>;
  authorizeSecurityHoldStep: (replacementValue: number) => Promise<boolean>;
  submitDigitalSignatureStep: (legalName: string) => Promise<boolean>;
  signAndActivateRental: (legalName: string) => Promise<boolean>;
  activateRentalStep: () => Promise<boolean>;
  openAuthorizationFlow: () => void;
  beginRentalAgreementIntro: () => Promise<void>;
  markPhotosApproved: () => Promise<void>;
  markPickupEvidenceReviewOpened: () => Promise<void>;
};

const Ctx = createContext<RentalWizardContextValue | null>(null);

export function useRentalWizard(): RentalWizardContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRentalWizard must be used within RentalWizardProvider');
  return v;
}

export type RentalWizardProviderProps = {
  ctx: RentalWizardContext;
  onRefresh: () => Promise<void>;
  lifecycleGate: WizardLifecyclePromptGateState;
  onClearLifecyclePrompt: () => void;
  children: React.ReactNode;
};

export function RentalWizardProvider({
  ctx,
  onRefresh,
  lifecycleGate,
  onClearLifecyclePrompt,
  children,
}: RentalWizardProviderProps) {
  const router = useRouter();
  const ctxRef = useRef(ctx);
  useEffect(() => {
    ctxRef.current = ctx;
    logCoordinationSyncTrace('wizard_provider_ctx', {
      source: 'RentalWizardProvider',
      ...coordinationSyncSnapshotFromCtx(ctx),
    });
  }, [ctx]);
  const [proposalBusy, setProposalBusy] = useState(false);
  const [arrivalActionBusy, setArrivalActionBusy] = useState(false);
  const [authorizationBusy, setAuthorizationBusy] = useState(false);

  const navigateAuthorizationNext = useCallback(async () => {
    await onRefresh();
    const freshCtx = ctxRef.current;
    if (!freshCtx) return;
    const step = resolveAuthorizationWizardStep(freshCtx);
    router.replace(wizardPathForStep(freshCtx.rentalId, step) as `/rental-wizard/${string}/s/${string}`);
  }, [onRefresh, router]);
  const hasPendingLifecyclePrompt = hasPendingWizardLifecyclePrompt(lifecycleGate);
  const lifecyclePromptId = lifecycleGate.id;

  const blockRedirectForLifecyclePrompt = useCallback(
    (source: string, targetStep?: string) => {
      if (!hasPendingLifecyclePrompt) return false;
      const extra = {
        source,
        targetStep,
        promptId: lifecyclePromptId,
        suspendedStep: lifecycleGate.suspendedStep,
      };
      if (lifecyclePromptId === 'return_coordination_accepted') {
        logWizardReturnPrompt(ctx.rentalId, 'return_prompt_blocking_redirect', extra);
      } else {
        logWizardNotificationPrompt(ctx.rentalId, 'notification_prompt_blocking_redirect', extra);
      }
      return true;
    },
    [ctx.rentalId, hasPendingLifecyclePrompt, lifecycleGate.suspendedStep, lifecyclePromptId]
  );

  const openMessages = useCallback(() => {
    router.push({ pathname: '/chat/[id]', params: { id: ctx.rentalId } });
  }, [ctx.rentalId, router]);

  const openAdvancedDetails = useCallback(
    (focus?: string) => {
      router.push({
        pathname: '/rental/[id]',
        params: focus ? { id: ctx.rentalId, focus } : { id: ctx.rentalId },
      });
    },
    [ctx.rentalId, router]
  );

  const goToWizardStep = useCallback(
    (step: RentalWizardStep) => {
      router.replace(wizardPathForStep(ctx.rentalId, step) as `/rental-wizard/${string}/s/${string}`);
    },
    [ctx.rentalId, router]
  );

  const navigateToResolvedDestination = useCallback(async () => {
    if (blockRedirectForLifecyclePrompt('goToResolvedNext')) return;
    await onRefresh();
    const freshCtx = ctxRef.current;
    if (!freshCtx) return;
    const dest = resolveRentalWizardDestination(freshCtx);
    const nav = evaluateWizardNavigationWithLifecycleGate({
      ctx: freshCtx,
      urlStep: lifecycleGate.suspendedStep ?? dest.step,
      gate: lifecycleGate,
    });
    const path = nav.shouldRedirect && nav.dest.path ? nav.dest.path : dest.path;
    if (path) {
      router.replace(path as `/rental-wizard/${string}/s/${string}`);
    }
  }, [blockRedirectForLifecyclePrompt, lifecycleGate, onRefresh, router]);

  const goToResolvedNext = navigateToResolvedDestination;

  const confirmPickupReceipt = useCallback(async () => {
    if (blockRedirectForLifecyclePrompt('confirmPickupReceipt')) return;
    const evidenceReviewed = Boolean(
      ctx.wizardProgress.renter_approved_pickup_photos_at?.trim() ||
        ctx.wizardProgress.renter_pickup_evidence_review_opened_at?.trim()
    );
    const inspection = evaluatePickupInspectionFlow({
      bothPresent: Boolean(
        ctx.rental.owner_arrived_at?.trim() &&
          (ctx.wizardProgress.renter_pickup_im_here_at?.trim() || ctx.rental.renter_arrived_at?.trim())
      ),
      handoffApprovalStarted: Boolean(
        ctx.rental.handoff_approval_started_at?.trim() || ctx.rental.handoff_approved_by_owner
      ),
      handoffCompleted: ctx.pickupHandoffComplete,
      renterArrived: Boolean(
        ctx.wizardProgress.renter_pickup_im_here_at?.trim() || ctx.rental.renter_arrived_at?.trim()
      ),
      evidenceReviewed,
      renterConfirmedReceipt: ctx.pickupAck.renter,
      manualChecklist: renterPickupManualFromVerificationRows(ctx.verificationRows, ctx.viewerUserId),
      viewerFlags: deriveWizardRenterViewerFlags({
        renterApprovedPickupPhotosAt: ctx.wizardProgress.renter_approved_pickup_photos_at,
        renterPickupEvidenceReviewOpenedAt: ctx.wizardProgress.renter_pickup_evidence_review_opened_at,
        renterViewedTimestampProofAt: ctx.wizardProgress.renter_viewed_timestamp_proof_at,
      }),
      pickupRenterConfirmed: ctx.pickupAck.renter,
    });
    if (!inspection.receiptButtonEnabled) {
      Alert.alert(
        'Finish your inspection',
        !evidenceReviewed
          ? 'Review the owner’s pickup photos first.'
          : 'Complete every in-person inspection item before confirming receipt.'
      );
      return;
    }
    const result = await persistRenterConfirmedPickupReceipt(
      getSupabase(),
      ctx.rentalId,
      ctx.rental.owner_user_id,
      ctx.viewerUserId
    );
    if (!result.ok) {
      Alert.alert('Could not confirm receipt', result.error);
      return;
    }
    await onRefresh();
    await navigateToResolvedDestination();
  }, [
    blockRedirectForLifecyclePrompt,
    ctx.rental.owner_user_id,
    ctx.rentalId,
    ctx.viewerUserId,
    navigateToResolvedDestination,
    onRefresh,
  ]);

  const acknowledgeLifecyclePrompt = useCallback(
    async (id: WizardLifecyclePromptId) => {
      if (lifecyclePromptId !== id) return;
      if (id === 'return_coordination_accepted') {
        logWizardReturnPrompt(ctx.rentalId, 'return_prompt_acknowledged', { promptId: id });
      } else {
        logWizardNotificationPrompt(ctx.rentalId, 'notification_prompt_acknowledged', { promptId: id });
      }
      onClearLifecyclePrompt();
      if (id === 'pickup_coordination_accepted') {
        logWizardNotificationPrompt(ctx.rentalId, 'notification_prompt_continue', { promptId: id });
        await onRefresh();
        goToWizardStep('transition_pickup_confirmed');
        return;
      }
      if (id === 'return_coordination_accepted') {
        logWizardReturnPrompt(ctx.rentalId, 'return_prompt_continue', { promptId: id });
        await onRefresh();
        goToWizardStep('transition_return_confirmed');
      }
    },
    [ctx.rentalId, goToWizardStep, lifecyclePromptId, onClearLifecyclePrompt, onRefresh]
  );

  const advanceAfterTransition = useCallback(
    async (fromStep: RentalWizardStep) => {
      if (blockRedirectForLifecyclePrompt('advanceAfterTransition', fromStep)) return;
      const key = transitionKeyForStep(fromStep);
      if (key) {
        ctx.seenTransitions.add(key);
        await markWizardTransitionSeen(ctx.rentalId, ctx.viewerUserId, fromStep);
      }
      await onRefresh();
      if (fromStep === 'transition_return_confirmed' && !ctx.seenTransitions.has('all_set_seen')) {
        goToWizardStep('transition_all_set');
        return;
      }
      const freshDest = resolveRentalWizardDestination({
        ...ctx,
        seenTransitions: ctx.seenTransitions,
      });
      router.replace(freshDest.path as `/rental-wizard/${string}/s/${string}`);
    },
    [blockRedirectForLifecyclePrompt, ctx, goToWizardStep, onRefresh, router]
  );

  const submitCoordinatePickupProposal = useCallback(
    async (draft: WizardMeetupProposalDraft): Promise<boolean> => {
      const meetupTimeIso = draft.meetupTimeIso?.trim();
      const meetupLocation = draft.location.trim();
      if (!meetupTimeIso || !meetupLocation) {
        Alert.alert('Missing details', 'Choose a location and time before proposing.');
        return false;
      }
      setProposalBusy(true);
      try {
        const returnTimeIso = resolveProposalReturnIsoForPickup(ctx, meetupTimeIso);
        const result = await submitRentalMeetupProposal(
          getSupabase(),
          ctx.rental,
          ctx.viewerUserId,
          {
            meetupTimeIso,
            returnTimeIso,
            meetupLocation,
            proposalMeta: {
              phase: 'pickup',
              handoffMethod: draft.method,
              agreedMethod: draft.agreedMethod,
              deliveryFee: draft.agreedDeliveryFee,
              locationEditedByRenter: draft.locationEditedByRenter,
            },
          },
          {
            requestSchedulingMeta: ctx.requestSchedulingMeta,
            scheduleHints: ctx.scheduleHints,
            rentalTitle: ctx.displayTitle,
          }
        );
        if (!result.ok) return false;
        await updateWizardProgress(
          ctx.rentalId,
          ctx.viewerUserId,
          viewerLastMeetupSubmissionPatch('pickup', {
            location: meetupLocation,
            meetupTimeIso,
          })
        );
        await onRefresh();
        if (blockRedirectForLifecyclePrompt('submitCoordinatePickupProposal')) return true;
        const freshCtx = { ...ctx, rental: { ...ctx.rental, last_proposed_by: ctx.viewerUserId } };
        const dest = resolveRentalWizardDestination(freshCtx);
        if (dest.path) router.replace(dest.path as `/rental-wizard/${string}/s/${string}`);
        return true;
      } finally {
        setProposalBusy(false);
      }
    },
    [blockRedirectForLifecyclePrompt, ctx, onRefresh, router]
  );

  const acceptCoordinatePickupProposal = useCallback(async (): Promise<boolean> => {
    setProposalBusy(true);
    try {
      const result = await acceptRentalMeetupProposal(getSupabase(), ctx.rental, ctx.viewerUserId, {
        itemTitle: ctx.displayTitle,
      });
      if (!result.ok) {
        Alert.alert('Could not accept pickup details', result.message ?? 'Please try again.');
        return false;
      }
      await onRefresh();
      if (blockRedirectForLifecyclePrompt('acceptCoordinatePickupProposal')) return true;
      goToWizardStep('transition_pickup_confirmed');
      return true;
    } finally {
      setProposalBusy(false);
    }
  }, [blockRedirectForLifecyclePrompt, ctx.displayTitle, ctx.rental, ctx.viewerUserId, goToWizardStep, onRefresh]);

  const submitCoordinateReturnProposal = useCallback(
    async (draft: WizardMeetupProposalDraft): Promise<boolean> => {
      const returnTimeIso = draft.meetupTimeIso?.trim();
      const returnLocation = draft.location.trim();
      const pickupIso = resolveAcceptedRentalPickupIso(ctx.rental);
      const pickupLocation = resolveAcceptedMeetupLocation(ctx.rental);
      if (!returnTimeIso || !returnLocation || !pickupIso || !pickupLocation) {
        Alert.alert('Missing details', 'Choose a return location and time before proposing.');
        return false;
      }
      setProposalBusy(true);
      try {
        const result = await submitRentalMeetupProposal(
          getSupabase(),
          ctx.rental,
          ctx.viewerUserId,
          {
            meetupTimeIso: pickupIso,
            returnTimeIso,
            meetupLocation: pickupLocation,
            returnLocation,
            proposalMeta: {
              handoffMethod: draft.method,
              phase: 'return',
              locationEditedByRenter: draft.locationEditedByRenter,
              timeEditedByRenter: draft.timeEditedByRenter,
            },
          },
          {
            requestSchedulingMeta: ctx.requestSchedulingMeta,
            scheduleHints: ctx.scheduleHints,
            rentalTitle: ctx.displayTitle,
          }
        );
        if (!result.ok) return false;
        await updateWizardProgress(
          ctx.rentalId,
          ctx.viewerUserId,
          viewerLastMeetupSubmissionPatch('return', {
            location: returnLocation,
            meetupTimeIso: returnTimeIso,
          })
        );
        await onRefresh();
        if (blockRedirectForLifecyclePrompt('submitCoordinateReturnProposal')) return true;
        return true;
      } finally {
        setProposalBusy(false);
      }
    },
    [blockRedirectForLifecyclePrompt, ctx, onRefresh]
  );

  const acknowledgeReturnCoordination = useCallback(async () => {
    const at = new Date().toISOString();
    await updateWizardProgress(ctx.rentalId, ctx.viewerUserId, {
      pickup_return_coordination_ack_at: at,
    });
    ctx.wizardProgress.pickup_return_coordination_ack_at = at;
  }, [ctx]);

  const completeReturnCoordination = useCallback(
    async (draft: WizardMeetupProposalDraft): Promise<boolean> => {
      const returnTimeIso = draft.meetupTimeIso?.trim();
      const returnLocation = draft.location.trim();
      if (!returnTimeIso || !returnLocation) {
        Alert.alert('Missing details', 'Choose a return location and time before continuing.');
        return false;
      }
      setProposalBusy(true);
      try {
        const result = await saveReturnCoordinationToRental(getSupabase(), ctx.rental, {
          returnTimeIso,
          returnLocation,
        });
        if (!result.ok) {
          Alert.alert('Could not save return details', result.message ?? 'Please try again.');
          return false;
        }
        const at = new Date().toISOString();
        await clearCoordinateReturnDraft(ctx.rentalId, ctx.viewerUserId, {
          pickup_return_coordination_ack_at: at,
        });
        ctx.wizardProgress.pickup_return_coordination_ack_at = at;
        delete ctx.wizardProgress.coordinate_return_draft;
        await onRefresh();
        return true;
      } finally {
        setProposalBusy(false);
      }
    },
    [acknowledgeReturnCoordination, ctx, onRefresh]
  );

  const toggleRenterPickupChecklistItem = useCallback(
    async (itemId: string) => {
      const def = RENTER_PICKUP_ITEMS.find((i) => i.id === itemId);
      if (!def || def.control !== 'manual') return;
      await ensureVerificationRows(
        getSupabase(),
        ctx.rentalId,
        ctx.rental.owner_user_id,
        ctx.viewerUserId,
        'pickup'
      );
      const manual = renterPickupManualFromVerificationRows(ctx.verificationRows, ctx.viewerUserId);
      const next = manualRenterPickupMapOnly({ ...manual, [itemId]: !manual[itemId] });
      await persistChecklistState(getSupabase(), ctx.rentalId, 'pickup', ctx.viewerUserId, next);
      await onRefresh();
    },
    [ctx.rental.owner_user_id, ctx.rentalId, ctx.verificationRows, ctx.viewerUserId, onRefresh]
  );

  const markViewedTimestampProof = useCallback(async () => {
    const at = new Date().toISOString();
    await updateWizardProgress(ctx.rentalId, ctx.viewerUserId, {
      renter_viewed_timestamp_proof_at: at,
    });
    ctx.wizardProgress.renter_viewed_timestamp_proof_at = at;
    await onRefresh();
  }, [ctx.rentalId, ctx.viewerUserId, ctx.wizardProgress, onRefresh]);

  const markImHerePickup = useCallback(async (): Promise<boolean> => {
    if (blockRedirectForLifecyclePrompt('markImHerePickup')) return false;
    const rentalId = ctxRef.current.rentalId;
    const viewerUserId = ctxRef.current.viewerUserId;
    const at = new Date().toISOString();
    setArrivalActionBusy(true);
    try {
      logScenario('lifecycle', {
        event: 'renter_pickup_im_here_start',
        rentalId,
        source: 'markImHerePickup',
      });
      await updateWizardProgress(rentalId, viewerUserId, {
        renter_pickup_im_here_at: at,
      });
      const live = ctxRef.current;
      live.wizardProgress.renter_pickup_im_here_at = at;
      live.rental = { ...live.rental, renter_arrived_at: at };

      if (!live.seenTransitions.has('pickup_ready_seen')) {
        await markWizardTransitionSeen(rentalId, viewerUserId, 'transition_pickup_ready');
        live.seenTransitions.add('pickup_ready_seen');
      }

      const arrive = await markRenterPickupArrived(getSupabase(), rentalId, at);
      if (!arrive.ok) {
        const hint =
          arrive.error?.includes('renter_arrived_at') ||
          arrive.error?.includes('does not exist')
            ? ' Database migration 071 (pickup handoff presence) may not be applied on this Supabase project.'
            : '';
        Alert.alert(
          'Could not mark arrival',
          `${arrive.error ?? 'Please try again.'}${hint}`
        );
        logScenario('lifecycle', {
          event: 'renter_pickup_im_here_failed',
          rentalId,
          error: arrive.error ?? 'unknown',
        });
        return false;
      }

      await onRefresh();
      const freshCtx = ctxRef.current;
      if (!freshCtx) {
        Alert.alert(
          'Arrival saved',
          'Your arrival was recorded, but the rental guide could not refresh. Go back and open the rental again.'
        );
        return true;
      }

      const dest = resolveRentalWizardDestination(freshCtx);
      logScenario('lifecycle', {
        event: 'renter_pickup_im_here_routing',
        rentalId,
        step: dest.step,
        path: dest.path,
      });
      if (dest.path) {
        router.replace(dest.path as `/rental-wizard/${string}/s/${string}`);
      }
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not mark your arrival.';
      Alert.alert('Could not mark arrival', message);
      logScenario('lifecycle', {
        event: 'renter_pickup_im_here_error',
        rentalId,
        error: message,
      });
      return false;
    } finally {
      setArrivalActionBusy(false);
    }
  }, [blockRedirectForLifecyclePrompt, onRefresh, router]);

  const markImHereReturn = useCallback(async (): Promise<boolean> => {
    if (blockRedirectForLifecyclePrompt('markImHereReturn')) return false;
    const rentalId = ctxRef.current.rentalId;
    const viewerUserId = ctxRef.current.viewerUserId;
    const at = new Date().toISOString();
    setArrivalActionBusy(true);
    try {
      await updateWizardProgress(rentalId, viewerUserId, {
        renter_return_im_here_at: at,
      });
      const live = ctxRef.current;
      live.wizardProgress.renter_return_im_here_at = at;
      await onRefresh();
      const freshCtx = ctxRef.current;
      if (!freshCtx) {
        Alert.alert(
          'Return arrival saved',
          'Your arrival was recorded, but the rental guide could not refresh.'
        );
        return true;
      }
      const dest = resolveRentalWizardDestination(freshCtx);
      if (dest.path) {
        router.replace(dest.path as `/rental-wizard/${string}/s/${string}`);
      }
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not mark your arrival.';
      Alert.alert('Could not mark return arrival', message);
      return false;
    } finally {
      setArrivalActionBusy(false);
    }
  }, [blockRedirectForLifecyclePrompt, onRefresh, router]);

  const openAuthorizationFlow = useCallback(() => {
    const live = ctxRef.current;
    if (!live) return;
    const step = resolveAuthorizationWizardStep(live);
    router.replace(
      wizardPathForStep(live.rentalId, step) as `/rental-wizard/${string}/s/${string}`
    );
  }, [router]);

  const beginRentalAgreementIntro = useCallback(async () => {
    const live = ctxRef.current;
    if (!live) return;
    const at = new Date().toISOString();
    await updateWizardProgress(live.rentalId, live.viewerUserId, {
      rental_agreement_intro_seen_at: at,
    });
    live.wizardProgress.rental_agreement_intro_seen_at = at;
    router.replace(
      wizardPathForStep(live.rentalId, 'rental_agreement') as `/rental-wizard/${string}/s/${string}`
    );
  }, [router]);

  // Intro is folded into the unified agreement review screen (Phase 18).

  const completeRentalAgreementStep = useCallback(
    async (input: { equipmentConditionAcknowledged: boolean }): Promise<boolean> => {
      if (!input.equipmentConditionAcknowledged) {
        Alert.alert(
          'Condition acknowledgment required',
          'Confirm equipment condition matches photos before continuing.'
        );
        return false;
      }
      setAuthorizationBusy(true);
      try {
        const live = ctxRef.current;
        const supabase = getSupabase();
        const at = new Date().toISOString();
        const equip = await persistEquipmentConditionAcknowledgment(supabase, live, at);
        if (!equip.ok) {
          Alert.alert('Could not save acknowledgment', equip.error);
          return false;
        }
        const agree = await persistRentalAgreementReview(supabase, live, at);
        if (!agree.ok) {
          Alert.alert('Could not save agreement review', agree.error);
          return false;
        }
        patchAgreementReviewOnCtx(live, at);
        await onRefresh();
        router.replace(
          wizardPathForStep(live.rentalId, 'security_hold_authorization') as `/rental-wizard/${string}/s/${string}`
        );
        return true;
      } catch (err) {
        Alert.alert(
          'Could not save',
          err instanceof Error ? err.message : 'Please try again.'
        );
        return false;
      } finally {
        setAuthorizationBusy(false);
      }
    },
    [onRefresh, router]
  );

  const completeUnifiedAgreementReview = useCallback(async (): Promise<boolean> => {
    setAuthorizationBusy(true);
    try {
      const live = ctxRef.current;
      const supabase = getSupabase();
      const at = new Date().toISOString();
      const agree = await persistRentalAgreementReview(supabase, live, at);
      if (!agree.ok) {
        Alert.alert('Could not save agreement review', agree.error);
        return false;
      }
      patchAgreementReviewOnCtx(live, at);

      const disclosureInput: LiabilityDisclosureInput = {
        lateFeePolicyAccepted: true,
        protectionDeclinedAcknowledged: Boolean(
          live.rental.protection_declined_acknowledged_at?.trim() ||
            live.rental.protection_coverage_acknowledged !== true
        ),
        protectionCoverageAccepted: live.rental.protection_coverage_acknowledged === true,
        riskInitials: live.wizardProgress.liability_risk_initials?.trim()?.slice(0, 8) || 'OK',
      };
      const disclosures = await persistLiabilityDisclosures(supabase, live, disclosureInput, at);
      if (!disclosures.ok) {
        Alert.alert('Could not save agreement', disclosures.error);
        return false;
      }
      patchLiabilityDisclosuresOnCtx(live, at, disclosureInput);
      await onRefresh();
      router.replace(
        wizardPathForStep(live.rentalId, 'security_hold_authorization') as `/rental-wizard/${string}/s/${string}`
      );
      return true;
    } catch (err) {
      Alert.alert('Could not save', err instanceof Error ? err.message : 'Please try again.');
      return false;
    } finally {
      setAuthorizationBusy(false);
    }
  }, [onRefresh, router]);

  const completeLiabilityDisclosuresStep = useCallback(
    async (input: LiabilityDisclosureInput): Promise<boolean> => {
      setAuthorizationBusy(true);
      try {
        const live = ctxRef.current;
        const at = new Date().toISOString();
        const result = await persistLiabilityDisclosures(getSupabase(), live, input, at);
        if (!result.ok) {
          Alert.alert('Could not save disclosures', result.error);
          return false;
        }
        patchLiabilityDisclosuresOnCtx(live, at, input);
        await onRefresh();
        router.replace(
          wizardPathForStep(live.rentalId, 'security_hold_authorization') as `/rental-wizard/${string}/s/${string}`
        );
        return true;
      } catch (err) {
        Alert.alert(
          'Could not save',
          err instanceof Error ? err.message : 'Please try again.'
        );
        return false;
      } finally {
        setAuthorizationBusy(false);
      }
    },
    [onRefresh, router]
  );

  const authorizeSecurityHoldStep = useCallback(
    async (replacementValue: number): Promise<boolean> => {
      setAuthorizationBusy(true);
      try {
        const live = ctxRef.current;
        const at = new Date().toISOString();
        const preauthAmount = calculatePreauthAmount(replacementValue);
        const result = await persistSecurityHoldAuthorization(
          getSupabase(),
          live,
          replacementValue,
          at
        );
        if (!result.ok) {
          Alert.alert('Could not authorize hold', result.error);
          return false;
        }
        patchSecurityHoldOnCtx(live, at, preauthAmount);
        await onRefresh();
        router.replace(
          wizardPathForStep(live.rentalId, 'digital_signature') as `/rental-wizard/${string}/s/${string}`
        );
        return true;
      } catch (err) {
        Alert.alert(
          'Authorization failed',
          err instanceof Error ? err.message : 'Please try again.'
        );
        return false;
      } finally {
        setAuthorizationBusy(false);
      }
    },
    [onRefresh, router]
  );

  const submitDigitalSignatureStep = useCallback(
    async (legalName: string): Promise<boolean> => {
      setAuthorizationBusy(true);
      try {
        const live = ctxRef.current;
        const price = Number(live.rental.price ?? 0);
        const replacementValue = Number(
          live.listingSnapshot?.replacement_value ?? Math.max(price * 3, 150)
        );
        const lateFee = Math.max(10, Math.round(price * 0.1));
        const maxLateFeeCap = Math.max(lateFee, lateFee * 7);
        const photoRefs = live.ownerPickupEvidence.map((p) => ({
          id: p.id,
          path: p.storagePath,
          phase: 'pickup' as string | null,
        }));
        const result = await persistDigitalSignature(getSupabase(), live, {
          legalName,
          agreementText: buildRentalAgreementText(),
          rentalSummaryJson: {
            rental_id: live.rentalId,
            listing_id: live.rental.listing_id,
            pickup_iso: live.pickupIso,
            return_iso: live.returnIso,
            meetup_location: live.rental.meetup_location,
          },
          replacementValue,
          dailyLateFee: lateFee,
          maxLateFeeCap,
          verificationPhotoRefs: photoRefs,
        });
        if (!result.ok) {
          Alert.alert('Could not sign agreement', result.error);
          return false;
        }
        patchDigitalSignatureOnCtx(live, new Date().toISOString(), normalizeLegalName(legalName));
        await onRefresh();
        router.replace(
          wizardPathForStep(live.rentalId, 'rental_activation') as `/rental-wizard/${string}/s/${string}`
        );
        return true;
      } catch (err) {
        Alert.alert('Could not sign', err instanceof Error ? err.message : 'Please try again.');
        return false;
      } finally {
        setAuthorizationBusy(false);
      }
    },
    [onRefresh, router]
  );

  const activateRentalStep = useCallback(async (): Promise<boolean> => {
    setAuthorizationBusy(true);
    try {
      const rentalId = ctxRef.current.rentalId;
      const result = await persistRentalActivation(getSupabase(), rentalId);
      if (!result.ok) {
        Alert.alert('Could not activate rental', result.error);
        return false;
      }
      await onRefresh();
      router.replace(
        wizardPathForStep(rentalId, 'transition_enjoy_rental') as `/rental-wizard/${string}/s/${string}`
      );
      return true;
    } catch (err) {
      Alert.alert(
        'Activation failed',
        err instanceof Error ? err.message : 'Please try again.'
      );
      return false;
    } finally {
      setAuthorizationBusy(false);
    }
  }, [onRefresh, router]);

  const signAndActivateRental = useCallback(
    async (legalName: string): Promise<boolean> => {
      setAuthorizationBusy(true);
      try {
        const live = ctxRef.current;
        const price = Number(live.rental.price ?? 0);
        const replacementValue = Number(
          live.listingSnapshot?.replacement_value ?? Math.max(price * 3, 150)
        );
        const lateFee = Math.max(10, Math.round(price * 0.1));
        const maxLateFeeCap = Math.max(lateFee, lateFee * 7);
        const photoRefs = live.ownerPickupEvidence.map((p) => ({
          id: p.id,
          path: p.storagePath,
          phase: 'pickup' as string | null,
        }));
        const signResult = await persistDigitalSignature(getSupabase(), live, {
          legalName,
          agreementText: buildRentalAgreementText(),
          rentalSummaryJson: {
            rental_id: live.rentalId,
            listing_id: live.rental.listing_id,
            pickup_iso: live.pickupIso,
            return_iso: live.returnIso,
            meetup_location: live.rental.meetup_location,
          },
          replacementValue,
          dailyLateFee: lateFee,
          maxLateFeeCap,
          verificationPhotoRefs: photoRefs,
        });
        if (!signResult.ok) {
          Alert.alert('Could not sign agreement', signResult.error);
          return false;
        }
        patchDigitalSignatureOnCtx(live, new Date().toISOString(), normalizeLegalName(legalName));

        const activateResult = await persistRentalActivation(getSupabase(), live.rentalId);
        if (!activateResult.ok) {
          Alert.alert('Could not activate rental', activateResult.error);
          return false;
        }
        await onRefresh();
        router.replace(
          wizardPathForStep(live.rentalId, 'transition_enjoy_rental') as `/rental-wizard/${string}/s/${string}`
        );
        return true;
      } catch (err) {
        Alert.alert('Could not complete', err instanceof Error ? err.message : 'Please try again.');
        return false;
      } finally {
        setAuthorizationBusy(false);
      }
    },
    [onRefresh, router]
  );

  const markPickupEvidenceReviewOpened = useCallback(async () => {
    const at = new Date().toISOString();
    const evidenceRevision = computeOwnerPickupEvidenceRevision(
      ctx.ownerPickupEvidence.map((p) => ({
        id: p.id,
        path: p.storagePath,
        pickupPhotoCategory: p.pickupPhotoCategory,
        createdAt: p.createdAt,
      }))
    );
    await updateWizardProgress(ctx.rentalId, ctx.viewerUserId, {
      renter_pickup_evidence_review_opened_at: at,
      renter_pickup_evidence_seen_revision: evidenceRevision,
    });
    ctx.wizardProgress.renter_pickup_evidence_review_opened_at = at;
    ctx.wizardProgress.renter_pickup_evidence_seen_revision = evidenceRevision;
    await onRefresh();
  }, [ctx, onRefresh]);

  const markPhotosApproved = useCallback(async () => {
    if (blockRedirectForLifecyclePrompt('markPhotosApproved')) return;
    if (!ctx.pickupEvidenceReadiness.renterEvidenceReady) {
      Alert.alert(
        'Photos not ready',
        'The owner still needs to finish uploading item, serial, and live possession proof photos.'
      );
      return;
    }
    if (!ctx.wizardProgress.renter_pickup_evidence_review_opened_at?.trim()) {
      Alert.alert('Review required', 'Open the evidence review screen before approving photos.');
      return;
    }
    await updateWizardProgress(ctx.rentalId, ctx.viewerUserId, {
      renter_approved_pickup_photos_at: new Date().toISOString(),
    });
    ctx.wizardProgress.renter_approved_pickup_photos_at = new Date().toISOString();
    await onRefresh();
    const dest = resolveRentalWizardDestination(ctx);
    router.replace(dest.path as `/rental-wizard/${string}/s/${string}`);
  }, [blockRedirectForLifecyclePrompt, ctx, onRefresh, router]);

  const value = useMemo(
    () => ({
      ctx,
      refresh: onRefresh,
      proposalBusy,
      lifecycleGate,
      lifecyclePromptId,
      hasPendingLifecyclePrompt,
      holdStepAutoCorrection: hasPendingLifecyclePrompt,
      acknowledgeLifecyclePrompt,
      goToWizardStep,
      openMessages,
      openAdvancedDetails,
      submitCoordinatePickupProposal,
      acceptCoordinatePickupProposal,
      submitCoordinateReturnProposal,
      acknowledgeReturnCoordination,
      completeReturnCoordination,
      advanceAfterTransition,
      goToResolvedNext,
      confirmPickupReceipt,
      toggleRenterPickupChecklistItem,
      markViewedTimestampProof,
      markImHerePickup,
      markImHereReturn,
      arrivalActionBusy,
      authorizationBusy,
      completeRentalAgreementStep,
      completeUnifiedAgreementReview,
      completeLiabilityDisclosuresStep,
      authorizeSecurityHoldStep,
      submitDigitalSignatureStep,
      signAndActivateRental,
      activateRentalStep,
      openAuthorizationFlow,
      beginRentalAgreementIntro,
      markPhotosApproved,
      markPickupEvidenceReviewOpened,
    }),
    [
      ctx,
      onRefresh,
      proposalBusy,
      arrivalActionBusy,
      authorizationBusy,
      lifecycleGate,
      lifecyclePromptId,
      hasPendingLifecyclePrompt,
      acknowledgeLifecyclePrompt,
      goToWizardStep,
      openMessages,
      openAdvancedDetails,
      submitCoordinatePickupProposal,
      acceptCoordinatePickupProposal,
      submitCoordinateReturnProposal,
      acknowledgeReturnCoordination,
      completeReturnCoordination,
      advanceAfterTransition,
      goToResolvedNext,
      confirmPickupReceipt,
      toggleRenterPickupChecklistItem,
      markViewedTimestampProof,
      markImHerePickup,
      markImHereReturn,
      completeRentalAgreementStep,
      completeUnifiedAgreementReview,
      completeLiabilityDisclosuresStep,
      authorizeSecurityHoldStep,
      submitDigitalSignatureStep,
      signAndActivateRental,
      activateRentalStep,
      openAuthorizationFlow,
      beginRentalAgreementIntro,
      markPhotosApproved,
      markPickupEvidenceReviewOpened,
    ]
  );

  const guidedBindings = useMemo(
    () => ({ ctx, refresh: onRefresh, openMessages }),
    [ctx, onRefresh, openMessages]
  );

  return (
    <Ctx.Provider value={value}>
      <GuidedRentalWizardBindingsProvider value={guidedBindings}>
        {children}
        <WizardLifecyclePromptHost />
      </GuidedRentalWizardBindingsProvider>
    </Ctx.Provider>
  );
}

export { WIZARD_STEP_META, wizardPathForStep };
