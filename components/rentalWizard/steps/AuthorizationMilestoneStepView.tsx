import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';

import { AuthMilestoneScreen } from '@/components/rentalWizard/authorization/AuthMilestoneScreen';
import { useRentalWizard } from '@/components/rentalWizard/RentalWizardProvider';
import {
  AUTHORIZATION_MILESTONES,
  type AuthorizationMilestoneConfig,
} from '@/lib/rentalAuthorization/authorizationMilestones';
import { markWizardTransitionSeen } from '@/lib/rentalWizard';
import { wizardPathForStep } from '@/lib/rentalWizard/wizardStepMeta';

export function AuthorizationMilestoneStepView({
  milestoneKey,
}: {
  milestoneKey: keyof typeof AUTHORIZATION_MILESTONES;
}) {
  const router = useRouter();
  const w = useRentalWizard();
  const config: AuthorizationMilestoneConfig = AUTHORIZATION_MILESTONES[milestoneKey];
  const [busy, setBusy] = useState(false);

  const onContinue = useCallback(async () => {
    setBusy(true);
    try {
      const live = w.ctx;
      await markWizardTransitionSeen(live.rentalId, live.viewerUserId, config.step);
      live.seenTransitions.add(config.seenKey);
      await w.refresh();
      router.replace(
        wizardPathForStep(live.rentalId, config.nextStep) as `/rental-wizard/${string}/s/${string}`
      );
    } finally {
      setBusy(false);
    }
  }, [config, router, w]);

  return (
    <AuthMilestoneScreen
      config={config}
      onBack={() => router.back()}
      onContinue={() => void onContinue()}
      busy={busy}
    />
  );
}
