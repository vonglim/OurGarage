import { useRouter } from 'expo-router';
import React, { createContext, useCallback, useContext, useMemo } from 'react';

import {
  markWizardTransitionSeen,
  resolveRentalWizardDestination,
  updateWizardProgress,
  wizardPathForStep,
} from '@/lib/rentalWizard';
import type { RentalWizardContext, RentalWizardStep } from '@/lib/rentalWizard/types';
import { transitionKeyForStep } from '@/lib/rentalWizard/rentalWizardTransitionResolver';
import { WIZARD_STEP_META } from '@/lib/rentalWizard/wizardStepMeta';

type RentalWizardContextValue = {
  ctx: RentalWizardContext;
  refresh: () => Promise<void>;
  openMessages: () => void;
  openAdvancedDetails: (focus?: string) => void;
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
      openMessages,
      openAdvancedDetails,
      advanceAfterTransition,
      goToResolvedNext,
      markImHerePickup,
      markImHereReturn,
      markPhotosApproved,
    }),
    [
      ctx,
      onRefresh,
      openMessages,
      openAdvancedDetails,
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
