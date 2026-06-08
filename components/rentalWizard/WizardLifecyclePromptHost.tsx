import React from 'react';

import { GuidedWizardMeetupLifecyclePromptHost } from '@/components/rentalWizard/GuidedWizardMeetupLifecyclePromptHost';
import { useRentalWizard } from '@/components/rentalWizard/RentalWizardProvider';

/**
 * Provider-level lifecycle prompts — survives step-screen re-renders and blocks navigation
 * until the viewer explicitly continues.
 */
export function WizardLifecyclePromptHost() {
  const w = useRentalWizard();
  return (
    <GuidedWizardMeetupLifecyclePromptHost
      ctx={w.ctx}
      lifecyclePromptId={w.lifecyclePromptId}
      acknowledgeLifecyclePrompt={w.acknowledgeLifecyclePrompt}
      openMessages={w.openMessages}
    />
  );
}
