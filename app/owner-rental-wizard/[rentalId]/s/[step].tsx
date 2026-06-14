import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { OwnerRentalWizardStepView } from '@/components/ownerRentalWizard/OwnerRentalWizardStepView';
import { useOwnerRentalWizard } from '@/components/ownerRentalWizard/OwnerRentalWizardProvider';
import {
  evaluateOwnerWizardNavigationWithLifecycleGate,
  ownerWizardStepFromSlug,
} from '@/lib/ownerRentalWizard';
import { logScenario } from '@/lib/rentalLifecycle/scenarioDevLog';
import {
  logWizardNotificationPrompt,
  logWizardReturnPrompt,
} from '@/lib/rentalWizard/wizardLifecyclePromptFromNotification';
import { ui } from '@/constants/appUi';

export default function OwnerRentalWizardStepScreen() {
  const { step: rawStep } = useLocalSearchParams<{ step: string }>();
  const router = useRouter();
  const { ctx, lifecycleGate, hasPendingLifecyclePrompt } = useOwnerRentalWizard();
  const slug = typeof rawStep === 'string' ? rawStep : '';
  const step = ownerWizardStepFromSlug(slug);

  useEffect(() => {
    if (!step) return;

    const nav = evaluateOwnerWizardNavigationWithLifecycleGate({
      ctx,
      urlStep: step,
      gate: lifecycleGate,
    });

    if (nav.redirectBlockedByPrompt) {
      const extra = {
        source: 'owner_wizard_step_screen',
        urlStep: step,
        logicalStep: nav.dest.step,
        path: nav.dest.path,
        promptId: lifecycleGate.id,
        suspendedStep: lifecycleGate.suspendedStep,
      };
      if (lifecycleGate.id === 'return_coordination_accepted') {
        logWizardReturnPrompt(ctx.rentalId, 'return_prompt_blocking_redirect', extra);
      } else {
        logWizardNotificationPrompt(ctx.rentalId, 'notification_prompt_blocking_redirect', extra);
      }
      return;
    }

    if (nav.shouldRedirect && nav.dest.path) {
      logScenario('routing', {
        event: 'owner_step_corrected',
        rentalId: ctx.rentalId,
        source: 'owner_wizard_step_screen',
        urlStep: step,
        logicalStep: nav.dest.step,
        path: nav.dest.path,
        hasPendingLifecyclePrompt,
      });
      router.replace(nav.dest.path as `/owner-rental-wizard/${string}/s/${string}`);
    }
  }, [ctx, hasPendingLifecyclePrompt, lifecycleGate, router, step]);

  if (!step) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={ui.primary} />
      </View>
    );
  }

  return <OwnerRentalWizardStepView step={step} />;
}
