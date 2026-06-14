import { useRouter } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { GuidedRentalWizardBindingsProvider } from '@/components/rentalWizard/GuidedRentalWizardBindingsContext';
import { GuidedWizardMeetupLifecyclePromptHost } from '@/components/rentalWizard/GuidedWizardMeetupLifecyclePromptHost';
import { Alert } from 'react-native';

import {
  confirmOwnerHandoff,
  confirmOwnerItemReady,
  markOwnerAtMeetup,
} from '@/lib/ownerRentalWizard/ownerPickupActions';
import {
  ownerWizardPathForStep,
  resolveOwnerRentalWizardDestination,
} from '@/lib/ownerRentalWizard';
import type { OwnerRentalWizardContext, OwnerRentalWizardStep } from '@/lib/ownerRentalWizard/types';
import { acceptRentalMeetupProposal, declineRentalMeetupProposal } from '@/lib/rentalMeetupProposalLifecycle';
import { evaluatePickupEvidenceReadiness } from '@/lib/pickupEvidenceReadiness';
import { resolvePickupHandoffPresenceState } from '@/lib/pickupHandoffLive';
import { markWizardTransitionSeen, updateWizardProgress } from '@/lib/rentalWizard';
import { submitRentalMeetupProposal } from '@/lib/rentalWizard/submitRentalMeetupProposal';
import { transitionKeyForStep } from '@/lib/rentalWizard/rentalWizardTransitionResolver';
import {
  hasPendingWizardLifecyclePrompt,
  type WizardLifecyclePromptGateState,
  type WizardLifecyclePromptId,
} from '@/lib/rentalWizard/wizardLifecyclePromptGate';
import {
  logWizardNotificationPrompt,
  logWizardReturnPrompt,
} from '@/lib/rentalWizard/wizardLifecyclePromptFromNotification';
import {
  resolveAcceptedMeetupLocation,
  resolveAcceptedRentalPickupIso,
} from '@/lib/rentalWizard/acceptedPickupCoordination';
import {
  resolveProposalReturnIsoForPickup,
  viewerLastMeetupSubmissionPatch,
  type WizardMeetupProposalDraft,
} from '@/lib/rentalWizard/wizardMeetupDraft';
import type { RentalWizardStep } from '@/lib/rentalWizard/types';
import { buildMeetupDayPickupExtensionProposalInput } from '@/lib/meetupDayLateExtension';
import { setRentalOperationalState } from '@/lib/rentalOperationalAttention';
import { getSupabase } from '@/lib/supabase';

type OwnerRentalWizardContextValue = {
  ctx: OwnerRentalWizardContext;
  refresh: () => Promise<void>;
  proposalBusy: boolean;
  actionBusy: boolean;
  lifecycleGate: WizardLifecyclePromptGateState;
  hasPendingLifecyclePrompt: boolean;
  acknowledgeLifecyclePrompt: (id: WizardLifecyclePromptId) => Promise<void>;
  confirmReturnCoordinationFromPrompt: () => Promise<void>;
  dismissReturnCoordinationConfirmPrompt: () => void;
  openMessages: () => void;
  openWorkspaceDetails: (focus?: string) => void;
  goToResolvedNext: () => Promise<void>;
  goToOwnerStep: (step: OwnerRentalWizardStep) => void;
  advanceAfterTransition: (fromStep: OwnerRentalWizardStep) => Promise<void>;
  submitCoordinatePickupProposal: (draft: WizardMeetupProposalDraft) => Promise<boolean>;
  submitCoordinateReturnProposal: (draft: WizardMeetupProposalDraft) => Promise<boolean>;
  completeReturnCoordination: (draft: WizardMeetupProposalDraft) => Promise<boolean>;
  acceptPickupProposal: () => Promise<boolean>;
  declinePickupProposal: () => Promise<boolean>;
  acceptReturnProposal: () => Promise<boolean>;
  declineReturnProposal: () => Promise<boolean>;
  confirmItemReady: () => Promise<boolean>;
  markOwnerImHere: () => Promise<boolean>;
  confirmHandoff: () => Promise<boolean>;
  submitMeetupDayPickupExtension: (newPickupIso: string) => Promise<boolean>;
  acceptMeetupDayPickupProposal: () => Promise<boolean>;
  declineMeetupDayPickupProposal: () => Promise<boolean>;
};

const Ctx = createContext<OwnerRentalWizardContextValue | null>(null);

export function useOwnerRentalWizard(): OwnerRentalWizardContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useOwnerRentalWizard must be used within OwnerRentalWizardProvider');
  return v;
}

export function OwnerRentalWizardProvider({
  ctx,
  onRefresh,
  lifecycleGate = { id: null, suspendedStep: null },
  onClearLifecyclePrompt,
  children,
}: {
  ctx: OwnerRentalWizardContext;
  onRefresh: () => Promise<void>;
  lifecycleGate?: WizardLifecyclePromptGateState;
  onClearLifecyclePrompt?: () => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const ctxRef = useRef(ctx);
  useEffect(() => {
    ctxRef.current = ctx;
  }, [ctx]);
  const [proposalBusy, setProposalBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const lifecyclePromptId = lifecycleGate.id;
  const hasPendingLifecyclePrompt = hasPendingWizardLifecyclePrompt(lifecycleGate);

  const openMessages = useCallback(() => {
    router.push({ pathname: '/chat/[id]', params: { id: ctx.rentalId } });
  }, [ctx.rentalId, router]);

  const openWorkspaceDetails = useCallback(
    (focus?: string) => {
      router.push({
        pathname: '/rental/[id]',
        params: focus ? { id: ctx.rentalId, focus } : { id: ctx.rentalId },
      });
    },
    [ctx.rentalId, router]
  );

  const goToOwnerStep = useCallback(
    (step: OwnerRentalWizardStep) => {
      router.replace(ownerWizardPathForStep(ctx.rentalId, step) as `/owner-rental-wizard/${string}/s/${string}`);
    },
    [ctx.rentalId, router]
  );

  const acknowledgeLifecyclePrompt = useCallback(
    async (id: WizardLifecyclePromptId) => {
      if (lifecyclePromptId !== id) return;
      if (id === 'return_coordination_accepted') {
        logWizardReturnPrompt(ctx.rentalId, 'return_prompt_acknowledged', { promptId: id });
      } else {
        logWizardNotificationPrompt(ctx.rentalId, 'notification_prompt_acknowledged', { promptId: id });
      }
      onClearLifecyclePrompt?.();
      await onRefresh();
      if (id === 'pickup_coordination_accepted') {
        goToOwnerStep('transition_pickup_confirmed');
        return;
      }
      if (id === 'return_coordination_accepted') {
        goToOwnerStep('transition_return_confirmed');
      }
    },
    [ctx.rentalId, goToOwnerStep, lifecyclePromptId, onClearLifecyclePrompt, onRefresh]
  );

  const goToResolvedNext = useCallback(async () => {
    await onRefresh();
    const fresh = ctxRef.current;
    if (!fresh) return;
    const dest = resolveOwnerRentalWizardDestination(fresh);
    if (dest.path) {
      router.replace(dest.path as `/owner-rental-wizard/${string}/s/${string}`);
    }
  }, [onRefresh, router]);

  const advanceAfterTransition = useCallback(
    async (fromStep: OwnerRentalWizardStep) => {
      const key = transitionKeyForStep(fromStep as unknown as RentalWizardStep);
      if (key) {
        await markWizardTransitionSeen(ctx.rentalId, ctx.viewerUserId, fromStep as unknown as RentalWizardStep);
        ctx.seenTransitions.add(key);
      }
      await onRefresh();
      if (fromStep === 'transition_return_confirmed' && !ctx.seenTransitions.has('all_set_seen')) {
        goToOwnerStep('transition_all_set');
        return;
      }
      await goToResolvedNext();
    },
    [ctx.rentalId, ctx.seenTransitions, ctx.viewerUserId, goToOwnerStep, goToResolvedNext]
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
        const live = ctxRef.current;
        const returnTimeIso = resolveProposalReturnIsoForPickup(live, meetupTimeIso);
        const result = await submitRentalMeetupProposal(
          getSupabase(),
          live.rental,
          live.viewerUserId,
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
            requestSchedulingMeta: live.requestSchedulingMeta,
            scheduleHints: live.scheduleHints,
            rentalTitle: live.displayTitle,
          }
        );
        if (!result.ok) return false;
        await updateWizardProgress(
          live.rentalId,
          live.viewerUserId,
          viewerLastMeetupSubmissionPatch('pickup', {
            location: meetupLocation,
            meetupTimeIso,
          })
        );
        await onRefresh();
        await goToResolvedNext();
        return true;
      } finally {
        setProposalBusy(false);
      }
    },
    [goToResolvedNext, onRefresh]
  );

  const submitCoordinateReturnProposal = useCallback(
    async (draft: WizardMeetupProposalDraft): Promise<boolean> => {
      const returnTimeIso = draft.meetupTimeIso?.trim();
      const returnLocation = draft.location.trim();
      const live = ctxRef.current;
      const pickupIso = resolveAcceptedRentalPickupIso(live.rental);
      const pickupLocation = resolveAcceptedMeetupLocation(live.rental);
      if (!returnTimeIso || !returnLocation || !pickupIso || !pickupLocation) {
        Alert.alert('Missing details', 'Choose a return location and time before proposing.');
        return false;
      }
      setProposalBusy(true);
      try {
        const result = await submitRentalMeetupProposal(
          getSupabase(),
          live.rental,
          live.viewerUserId,
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
            requestSchedulingMeta: live.requestSchedulingMeta,
            scheduleHints: live.scheduleHints,
            rentalTitle: live.displayTitle,
          }
        );
        if (!result.ok) return false;
        await updateWizardProgress(
          live.rentalId,
          live.viewerUserId,
          viewerLastMeetupSubmissionPatch('return', {
            location: returnLocation,
            meetupTimeIso: returnTimeIso,
          })
        );
        await onRefresh();
        return true;
      } finally {
        setProposalBusy(false);
      }
    },
    [onRefresh]
  );

  const completeReturnCoordination = useCallback(
    async (draft: WizardMeetupProposalDraft): Promise<boolean> => {
      return submitCoordinateReturnProposal(draft);
    },
    [submitCoordinateReturnProposal]
  );

  const acceptPickupProposal = useCallback(async () => {
    setProposalBusy(true);
    try {
      const live = ctxRef.current;
      const result = await acceptRentalMeetupProposal(getSupabase(), live.rental, live.viewerUserId, {
        itemTitle: live.displayTitle,
      });
      if (!result.ok) {
        Alert.alert('Could not accept', result.message ?? 'Try again.');
        return false;
      }
      await onRefresh();
      goToOwnerStep('transition_pickup_confirmed');
      return true;
    } finally {
      setProposalBusy(false);
    }
  }, [goToOwnerStep, onRefresh]);

  const declinePickupProposal = useCallback(async () => {
    setProposalBusy(true);
    try {
      const live = ctxRef.current;
      const result = await declineRentalMeetupProposal(getSupabase(), live.rental, live.viewerUserId);
      if (!result.ok) {
        Alert.alert('Could not decline', result.message ?? 'Try again.');
        return false;
      }
      await onRefresh();
      return true;
    } finally {
      setProposalBusy(false);
    }
  }, [onRefresh]);

  const acceptReturnProposal = useCallback(async () => {
    setProposalBusy(true);
    try {
      const live = ctxRef.current;
      const result = await acceptRentalMeetupProposal(getSupabase(), live.rental, live.viewerUserId, {
        itemTitle: live.displayTitle,
      });
      if (!result.ok) {
        Alert.alert('Could not accept', result.message ?? 'Try again.');
        return false;
      }
      await onRefresh();
      goToOwnerStep('transition_return_confirmed');
      return true;
    } finally {
      setProposalBusy(false);
    }
  }, [goToOwnerStep, onRefresh]);

  const declineReturnProposal = useCallback(async () => {
    setProposalBusy(true);
    try {
      const live = ctxRef.current;
      const result = await declineRentalMeetupProposal(getSupabase(), live.rental, live.viewerUserId);
      if (!result.ok) {
        Alert.alert('Could not decline', result.message ?? 'Try again.');
        return false;
      }
      await onRefresh();
      return true;
    } finally {
      setProposalBusy(false);
    }
  }, [onRefresh]);

  const confirmReturnCoordinationFromPrompt = useCallback(async () => {
    if (lifecyclePromptId !== 'return_coordination_confirm_requested') return;
    setProposalBusy(true);
    try {
      const ok = await acceptReturnProposal();
      if (ok) onClearLifecyclePrompt?.();
    } finally {
      setProposalBusy(false);
    }
  }, [acceptReturnProposal, lifecyclePromptId, onClearLifecyclePrompt]);

  const dismissReturnCoordinationConfirmPrompt = useCallback(() => {
    if (lifecyclePromptId !== 'return_coordination_confirm_requested') return;
    onClearLifecyclePrompt?.();
  }, [lifecyclePromptId, onClearLifecyclePrompt]);

  const submitMeetupDayPickupExtension = useCallback(
    async (newPickupIso: string): Promise<boolean> => {
      const live = ctxRef.current;
      const input = buildMeetupDayPickupExtensionProposalInput(live, newPickupIso);
      if (!input) {
        Alert.alert('Missing details', 'Could not build pickup extension request.');
        return false;
      }
      setProposalBusy(true);
      try {
        const result = await submitRentalMeetupProposal(
          getSupabase(),
          live.rental,
          live.viewerUserId,
          {
            meetupTimeIso: input.meetupTimeIso,
            returnTimeIso: input.returnTimeIso,
            meetupLocation: input.meetupLocation,
            proposalMeta: { phase: 'pickup' },
          },
          {
            requestSchedulingMeta: live.requestSchedulingMeta,
            scheduleHints: live.scheduleHints,
            rentalTitle: live.displayTitle,
          }
        );
        if (!result.ok) return false;
        await setRentalOperationalState(getSupabase(), live.rentalId, 'pickup', 'running_late');
        await onRefresh();
        return true;
      } finally {
        setProposalBusy(false);
      }
    },
    [onRefresh]
  );

  const acceptMeetupDayPickupProposal = useCallback(async (): Promise<boolean> => {
    setProposalBusy(true);
    try {
      const live = ctxRef.current;
      const result = await acceptRentalMeetupProposal(getSupabase(), live.rental, live.viewerUserId, {
        itemTitle: live.displayTitle,
      });
      if (!result.ok) {
        Alert.alert('Could not accept', result.message ?? 'Try again.');
        return false;
      }
      await setRentalOperationalState(getSupabase(), live.rentalId, 'pickup', null);
      await onRefresh();
      return true;
    } finally {
      setProposalBusy(false);
    }
  }, [onRefresh]);

  const declineMeetupDayPickupProposal = useCallback(async (): Promise<boolean> => {
    setProposalBusy(true);
    try {
      const live = ctxRef.current;
      const result = await declineRentalMeetupProposal(getSupabase(), live.rental, live.viewerUserId);
      if (!result.ok) {
        Alert.alert('Could not decline', result.message ?? 'Try again.');
        return false;
      }
      await onRefresh();
      return true;
    } finally {
      setProposalBusy(false);
    }
  }, [onRefresh]);

  const confirmItemReady = useCallback(async () => {
    setActionBusy(true);
    try {
      const live = ctxRef.current;
      const readiness = evaluatePickupEvidenceReadiness(live.ownerPickupEvidence);
      const ownerPrepComplete = readiness.ownerEvidenceReady;
      const result = await confirmOwnerItemReady(getSupabase(), live.rental, {
        ownerPickupPrepComplete: ownerPrepComplete,
        finalPrice: Number(live.rental.price ?? 0),
      });
      if (!result.ok) {
        Alert.alert('Could not confirm', result.error ?? 'Try again.');
        return false;
      }
      await onRefresh();
      await goToResolvedNext();
      return true;
    } finally {
      setActionBusy(false);
    }
  }, [goToResolvedNext, onRefresh]);

  const markOwnerImHere = useCallback(async () => {
    setActionBusy(true);
    try {
      const live = ctxRef.current;
      const result = await markOwnerAtMeetup(getSupabase(), live.rentalId);
      if (!result.ok) {
        Alert.alert('Could not save arrival', result.error ?? 'Try again.');
        return false;
      }
      await onRefresh();
      await goToResolvedNext();
      return true;
    } finally {
      setActionBusy(false);
    }
  }, [goToResolvedNext, onRefresh]);

  const confirmHandoff = useCallback(async () => {
    setActionBusy(true);
    try {
      const live = ctxRef.current;
      const presence = resolvePickupHandoffPresenceState({
        rental: live.rental,
        renterPickupImHereAt: live.wizardProgress.renter_pickup_im_here_at,
        renterApprovedPickupPhotosAt: live.wizardProgress.renter_approved_pickup_photos_at,
        pickupAck: live.pickupAck,
        ownerPickupPrepComplete: true,
        handoffApprovalStarted: Boolean(
          live.rental.handoff_approval_started_at?.trim() || live.rental.handoff_approved_by_owner
        ),
        handoffCompleted: live.pickupHandoffComplete,
        viewerRole: 'owner',
      });
      if (!presence.bothPresent) {
        Alert.alert('Meet at the location', 'Both parties need to be at the meetup first.');
        return false;
      }
      const result = await confirmOwnerHandoff(getSupabase(), live.rental);
      if (!result.ok) {
        Alert.alert('Could not confirm handoff', result.error ?? 'Try again.');
        return false;
      }
      await onRefresh();
      await goToResolvedNext();
      return true;
    } finally {
      setActionBusy(false);
    }
  }, [goToResolvedNext, onRefresh]);

  const value: OwnerRentalWizardContextValue = {
    ctx,
    refresh: onRefresh,
    proposalBusy,
    actionBusy,
    lifecycleGate,
    hasPendingLifecyclePrompt,
    acknowledgeLifecyclePrompt,
    confirmReturnCoordinationFromPrompt,
    dismissReturnCoordinationConfirmPrompt,
    openMessages,
    openWorkspaceDetails,
    goToResolvedNext,
    goToOwnerStep,
    advanceAfterTransition,
    submitCoordinatePickupProposal,
    submitCoordinateReturnProposal,
    completeReturnCoordination,
    acceptPickupProposal,
    declinePickupProposal,
    acceptReturnProposal,
    declineReturnProposal,
    confirmItemReady,
    markOwnerImHere,
    confirmHandoff,
    submitMeetupDayPickupExtension,
    acceptMeetupDayPickupProposal,
    declineMeetupDayPickupProposal,
  };

  const bindings = useMemo(
    () => ({ ctx, refresh: onRefresh, openMessages }),
    [ctx, onRefresh, openMessages]
  );

  return (
    <Ctx.Provider value={value}>
      <GuidedRentalWizardBindingsProvider value={bindings}>
        <GuidedWizardMeetupLifecyclePromptHost
          ctx={ctx}
          lifecyclePromptId={lifecyclePromptId}
          acknowledgeLifecyclePrompt={(id) => void acknowledgeLifecyclePrompt(id)}
          openMessages={openMessages}
          confirmReturnCoordinationFromPrompt={() => void confirmReturnCoordinationFromPrompt()}
          dismissReturnCoordinationConfirmPrompt={dismissReturnCoordinationConfirmPrompt}
        />
        {children}
      </GuidedRentalWizardBindingsProvider>
    </Ctx.Provider>
  );
}
