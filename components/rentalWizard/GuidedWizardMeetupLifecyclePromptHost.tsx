import React, { useEffect, useMemo } from 'react';

import { WizardLifecyclePromptOverlay } from '@/components/rentalWizard/WizardLifecyclePromptOverlay';
import {
  buildPickupCoordinationAcceptedPromptContent,
  buildPickupEvidenceReadyPromptContent,
  buildReturnCoordinationAcceptedPromptContent,
  buildReturnCoordinationConfirmRequestedPromptContent,
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
  /** Counterparty confirmed return details — viewer accepts from popup. */
  confirmReturnCoordinationFromPrompt?: () => void | Promise<void>;
  /** Counterparty confirmed return details — viewer dismisses to edit on the step. */
  dismissReturnCoordinationConfirmPrompt?: () => void;
};

/**
 * Shared meetup acceptance overlays for renter and owner guided wizards.
 */
export function GuidedWizardMeetupLifecyclePromptHost({
  ctx,
  lifecyclePromptId,
  acknowledgeLifecyclePrompt,
  openMessages,
  confirmReturnCoordinationFromPrompt,
  dismissReturnCoordinationConfirmPrompt,
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
  const pickupEvidenceContent = useMemo(
    () => buildPickupEvidenceReadyPromptContent(ctx),
    [ctx]
  );
  const returnConfirmRequestContent = useMemo(
    () => buildReturnCoordinationConfirmRequestedPromptContent(ctx),
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
    if (lifecyclePromptId === 'return_coordination_confirm_requested') {
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
      {lifecyclePromptId === 'pickup_evidence_ready' ? (
        <WizardLifecyclePromptOverlay
          visible
          headline={pickupEvidenceContent.headline}
          body={pickupEvidenceContent.body}
          detailLines={pickupEvidenceContent.detailLines}
          primaryLabel={pickupEvidenceContent.primaryLabel}
          onPrimary={() => acknowledgeLifecyclePrompt('pickup_evidence_ready')}
        />
      ) : null}
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
      {lifecyclePromptId === 'return_coordination_confirm_requested' ? (
        <WizardLifecyclePromptOverlay
          visible
          headline={returnConfirmRequestContent.headline}
          body={returnConfirmRequestContent.body}
          detailLines={returnConfirmRequestContent.detailLines}
          primaryLabel={returnConfirmRequestContent.primaryLabel}
          onPrimary={() => {
            if (confirmReturnCoordinationFromPrompt) {
              void confirmReturnCoordinationFromPrompt();
              return;
            }
            acknowledgeLifecyclePrompt('return_coordination_confirm_requested');
          }}
          secondaryLabel="Make a change"
          onSecondary={() => {
            if (dismissReturnCoordinationConfirmPrompt) {
              dismissReturnCoordinationConfirmPrompt();
              return;
            }
            acknowledgeLifecyclePrompt('return_coordination_confirm_requested');
          }}
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
