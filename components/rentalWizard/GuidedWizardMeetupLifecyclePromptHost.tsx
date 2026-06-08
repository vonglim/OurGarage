import React, { useEffect, useMemo } from 'react';

import { WizardLifecyclePromptOverlay } from '@/components/rentalWizard/WizardLifecyclePromptOverlay';
import {
  buildPickupCoordinationAcceptedPromptContent,
  buildReturnCoordinationAcceptedPromptContent,
} from '@/lib/rentalWizard/formatWizardLifecyclePrompt';
import {
  logWizardNotificationPrompt,
  logWizardReturnPrompt,
} from '@/lib/rentalWizard/wizardLifecyclePromptFromNotification';
import type { WizardLifecyclePromptId } from '@/lib/rentalWizard/wizardLifecyclePromptGate';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';

type GuidedWizardMeetupLifecyclePromptHostProps = {
  ctx: RentalWizardContext;
  lifecyclePromptId: WizardLifecyclePromptId | null;
  acknowledgeLifecyclePrompt: (id: WizardLifecyclePromptId) => void;
  openMessages: () => void;
};

/**
 * Shared meetup acceptance overlays for renter and owner guided wizards.
 */
export function GuidedWizardMeetupLifecyclePromptHost({
  ctx,
  lifecyclePromptId,
  acknowledgeLifecyclePrompt,
  openMessages,
}: GuidedWizardMeetupLifecyclePromptHostProps) {
  const visible = lifecyclePromptId != null;

  const pickupContent = useMemo(
    () => buildPickupCoordinationAcceptedPromptContent(ctx),
    [ctx]
  );
  const returnContent = useMemo(
    () => buildReturnCoordinationAcceptedPromptContent(ctx),
    [ctx]
  );

  useEffect(() => {
    if (!visible || !lifecyclePromptId) return;
    if (lifecyclePromptId === 'return_coordination_accepted') {
      logWizardReturnPrompt(ctx.rentalId, 'return_prompt_rendered', {
        promptId: lifecyclePromptId,
      });
      return;
    }
    logWizardNotificationPrompt(ctx.rentalId, 'notification_prompt_rendered', {
      promptId: lifecyclePromptId,
    });
  }, [ctx.rentalId, lifecyclePromptId, visible]);

  if (!visible) return null;

  return (
    <>
      {lifecyclePromptId === 'pickup_coordination_accepted' ? (
        <WizardLifecyclePromptOverlay
          visible
          headline={pickupContent.headline}
          body={pickupContent.body}
          detailLines={pickupContent.detailLines}
          primaryLabel={pickupContent.primaryLabel}
          onPrimary={() => acknowledgeLifecyclePrompt('pickup_coordination_accepted')}
          secondaryLabel="Open messages"
          onSecondary={openMessages}
        />
      ) : null}
      {lifecyclePromptId === 'return_coordination_accepted' ? (
        <WizardLifecyclePromptOverlay
          visible
          headline={returnContent.headline}
          body={returnContent.body}
          detailLines={returnContent.detailLines}
          primaryLabel={returnContent.primaryLabel}
          onPrimary={() => acknowledgeLifecyclePrompt('return_coordination_accepted')}
          secondaryLabel="Open messages"
          onSecondary={openMessages}
        />
      ) : null}
    </>
  );
}
