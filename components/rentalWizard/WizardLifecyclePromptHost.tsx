import React, { useEffect, useMemo } from 'react';

import { WizardLifecyclePromptOverlay } from '@/components/rentalWizard/WizardLifecyclePromptOverlay';
import { useRentalWizard } from '@/components/rentalWizard/RentalWizardProvider';
import { buildPickupCoordinationAcceptedPromptContent } from '@/lib/rentalWizard/formatWizardLifecyclePrompt';
import { logWizardNotificationPrompt } from '@/lib/rentalWizard/wizardLifecyclePromptFromNotification';
import type { WizardLifecyclePromptId } from '@/lib/rentalWizard/wizardLifecyclePromptGate';

/**
 * Provider-level lifecycle prompts — survives step-screen re-renders and blocks navigation
 * until the renter explicitly continues.
 */
export function WizardLifecyclePromptHost() {
  const w = useRentalWizard();
  const { ctx, lifecyclePromptId, acknowledgeLifecyclePrompt } = w;

  const visible = lifecyclePromptId != null;

  const pickupContent = useMemo(
    () => buildPickupCoordinationAcceptedPromptContent(ctx),
    [ctx]
  );

  useEffect(() => {
    if (!visible || !lifecyclePromptId) return;
    logWizardNotificationPrompt(ctx.rentalId, 'notification_prompt_rendered', {
      promptId: lifecyclePromptId,
    });
  }, [ctx.rentalId, lifecyclePromptId, visible]);

  if (!visible) return null;

  return (
    <PickupCoordinationAcceptedPrompt
      promptId={lifecyclePromptId}
      visible={lifecyclePromptId === 'pickup_coordination_accepted'}
      content={pickupContent}
      onContinue={() => void acknowledgeLifecyclePrompt('pickup_coordination_accepted')}
      onOpenMessages={w.openMessages}
    />
  );
}

function PickupCoordinationAcceptedPrompt({
  promptId,
  visible,
  content,
  onContinue,
  onOpenMessages,
}: {
  promptId: WizardLifecyclePromptId;
  visible: boolean;
  content: ReturnType<typeof buildPickupCoordinationAcceptedPromptContent>;
  onContinue: () => void;
  onOpenMessages: () => void;
}) {
  if (promptId !== 'pickup_coordination_accepted' || !visible) return null;

  return (
    <WizardLifecyclePromptOverlay
      visible
      headline={content.headline}
      body={content.body}
      detailLines={content.detailLines}
      primaryLabel="Continue"
      onPrimary={onContinue}
      secondaryLabel="Open messages"
      onSecondary={onOpenMessages}
    />
  );
}
