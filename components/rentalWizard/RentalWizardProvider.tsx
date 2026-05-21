import { useRouter } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';

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
  markImHerePickup: () => Promise<void>;
  markImHereReturn: () => Promise<void>;
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
  }, [ctx]);
  const [proposalBusy, setProposalBusy] = useState(false);
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
      const freshDest = resolveRentalWizardDestination({
        ...ctx,
        seenTransitions: ctx.seenTransitions,
      });
      router.replace(freshDest.path as `/rental-wizard/${string}/s/${string}`);
    },
    [blockRedirectForLifecyclePrompt, ctx, onRefresh, router]
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

  const markImHerePickup = useCallback(async () => {
    if (blockRedirectForLifecyclePrompt('markImHerePickup')) return;
    const at = new Date().toISOString();
    await updateWizardProgress(ctx.rentalId, ctx.viewerUserId, {
      renter_pickup_im_here_at: at,
    });
    ctx.wizardProgress.renter_pickup_im_here_at = at;
    await markRenterPickupArrived(getSupabase(), ctx.rentalId, at);
    await onRefresh();
    const dest = resolveRentalWizardDestination(ctx);
    router.replace(dest.path as `/rental-wizard/${string}/s/${string}`);
  }, [blockRedirectForLifecyclePrompt, ctx, onRefresh, router]);

  const markImHereReturn = useCallback(async () => {
    if (blockRedirectForLifecyclePrompt('markImHereReturn')) return;
    await updateWizardProgress(ctx.rentalId, ctx.viewerUserId, {
      renter_return_im_here_at: new Date().toISOString(),
    });
    ctx.wizardProgress.renter_return_im_here_at = new Date().toISOString();
    await onRefresh();
    const dest = resolveRentalWizardDestination(ctx);
    router.replace(dest.path as `/rental-wizard/${string}/s/${string}`);
  }, [blockRedirectForLifecyclePrompt, ctx, onRefresh, router]);

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
      markPhotosApproved,
      markPickupEvidenceReviewOpened,
    }),
    [
      ctx,
      onRefresh,
      proposalBusy,
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
      markPhotosApproved,
      markPickupEvidenceReviewOpened,
    ]
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <WizardLifecyclePromptHost />
    </Ctx.Provider>
  );
}

export { WIZARD_STEP_META, wizardPathForStep };
