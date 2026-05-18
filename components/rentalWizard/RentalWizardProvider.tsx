import { useRouter } from 'expo-router';
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Alert } from 'react-native';

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
import { saveReturnCoordinationToRental } from '@/lib/rentalWizard/saveReturnCoordination';
import {
  resolveProposalReturnIsoForPickup,
  type WizardMeetupProposalDraft,
} from '@/lib/rentalWizard/wizardMeetupDraft';
import { getSupabase } from '@/lib/supabase';

type RentalWizardContextValue = {
  ctx: RentalWizardContext;
  refresh: () => Promise<void>;
  proposalBusy: boolean;
  openMessages: () => void;
  openAdvancedDetails: (focus?: string) => void;
  submitCoordinatePickupProposal: (draft: WizardMeetupProposalDraft) => Promise<boolean>;
  submitCoordinateReturnProposal: (draft: WizardMeetupProposalDraft) => Promise<boolean>;
  acknowledgeReturnCoordination: () => Promise<void>;
  completeReturnCoordination: (draft: WizardMeetupProposalDraft) => Promise<boolean>;
  advanceAfterTransition: (fromStep: RentalWizardStep) => Promise<void>;
  goToResolvedNext: () => Promise<void>;
  markImHerePickup: () => Promise<void>;
  markImHereReturn: () => Promise<void>;
  markPhotosApproved: () => Promise<void>;
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
  children: React.ReactNode;
};

export function RentalWizardProvider({ ctx, onRefresh, children }: RentalWizardProviderProps) {
  const router = useRouter();
  const [proposalBusy, setProposalBusy] = useState(false);

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

  const goToResolvedNext = useCallback(async () => {
    await onRefresh();
    const dest = resolveRentalWizardDestination(ctx);
    if (dest.path) router.replace(dest.path as `/rental-wizard/${string}/s/${string}`);
  }, [ctx, onRefresh, router]);

  const advanceAfterTransition = useCallback(
    async (fromStep: RentalWizardStep) => {
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
    [ctx, onRefresh, router]
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
              handoffMethod: draft.method,
              agreedMethod: draft.agreedMethod,
              deliveryFee: draft.agreedDeliveryFee,
              locationEditedByRenter: draft.locationEditedByRenter,
            },
          },
          {
            requestSchedulingMeta: ctx.requestSchedulingMeta,
            rentalTitle: ctx.displayTitle,
          }
        );
        if (!result.ok) return false;
        await onRefresh();
        const freshCtx = { ...ctx, rental: { ...ctx.rental, last_proposed_by: ctx.viewerUserId } };
        const dest = resolveRentalWizardDestination(freshCtx);
        if (dest.path) router.replace(dest.path as `/rental-wizard/${string}/s/${string}`);
        return true;
      } finally {
        setProposalBusy(false);
      }
    },
    [ctx, onRefresh, router]
  );

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
            rentalTitle: ctx.displayTitle,
          }
        );
        if (!result.ok) return false;
        await onRefresh();
        return true;
      } finally {
        setProposalBusy(false);
      }
    },
    [ctx, onRefresh]
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

  const markImHerePickup = useCallback(async () => {
    await updateWizardProgress(ctx.rentalId, ctx.viewerUserId, {
      renter_pickup_im_here_at: new Date().toISOString(),
    });
    ctx.wizardProgress.renter_pickup_im_here_at = new Date().toISOString();
    await onRefresh();
    const dest = resolveRentalWizardDestination(ctx);
    router.replace(dest.path as `/rental-wizard/${string}/s/${string}`);
  }, [ctx, onRefresh, router]);

  const markImHereReturn = useCallback(async () => {
    await updateWizardProgress(ctx.rentalId, ctx.viewerUserId, {
      renter_return_im_here_at: new Date().toISOString(),
    });
    ctx.wizardProgress.renter_return_im_here_at = new Date().toISOString();
    await onRefresh();
    const dest = resolveRentalWizardDestination(ctx);
    router.replace(dest.path as `/rental-wizard/${string}/s/${string}`);
  }, [ctx, onRefresh, router]);

  const markPhotosApproved = useCallback(async () => {
    await updateWizardProgress(ctx.rentalId, ctx.viewerUserId, {
      renter_approved_pickup_photos_at: new Date().toISOString(),
    });
    ctx.wizardProgress.renter_approved_pickup_photos_at = new Date().toISOString();
    await onRefresh();
    const dest = resolveRentalWizardDestination(ctx);
    router.replace(dest.path as `/rental-wizard/${string}/s/${string}`);
  }, [ctx, onRefresh, router]);

  const value = useMemo(
    () => ({
      ctx,
      refresh: onRefresh,
      proposalBusy,
      openMessages,
      openAdvancedDetails,
      submitCoordinatePickupProposal,
      submitCoordinateReturnProposal,
      acknowledgeReturnCoordination,
      completeReturnCoordination,
      advanceAfterTransition,
      goToResolvedNext,
      markImHerePickup,
      markImHereReturn,
      markPhotosApproved,
    }),
    [
      ctx,
      onRefresh,
      proposalBusy,
      openMessages,
      openAdvancedDetails,
      submitCoordinatePickupProposal,
      submitCoordinateReturnProposal,
      acknowledgeReturnCoordination,
      completeReturnCoordination,
      advanceAfterTransition,
      goToResolvedNext,
      markImHerePickup,
      markImHereReturn,
      markPhotosApproved,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export { WIZARD_STEP_META, wizardPathForStep };
