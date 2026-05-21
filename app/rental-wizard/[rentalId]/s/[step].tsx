import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { RentalWizardStepView } from '@/components/rentalWizard/RentalWizardStepView';
import { useRentalWizard } from '@/components/rentalWizard/RentalWizardProvider';
import { logScenario } from '@/lib/rentalLifecycle/scenarioDevLog';
import { wizardStepFromSlug } from '@/lib/rentalWizard/wizardStepMeta';
import { evaluateWizardNavigationWithLifecycleGate } from '@/lib/rentalWizard/wizardLifecyclePromptGate';
import {
  logWizardNotificationPrompt,
  logWizardReturnPrompt,
} from '@/lib/rentalWizard/wizardLifecyclePromptFromNotification';
import { ui } from '@/constants/appUi';

export default function RentalWizardStepScreen() {
  const { step: rawStep } = useLocalSearchParams<{ step: string }>();
  const router = useRouter();
  const { ctx, lifecycleGate, hasPendingLifecyclePrompt } = useRentalWizard();
  const slug = typeof rawStep === 'string' ? rawStep : '';
  const step = wizardStepFromSlug(slug);

  useEffect(() => {
    if (!step) return;

    const nav = evaluateWizardNavigationWithLifecycleGate({
      ctx,
      urlStep: step,
      gate: lifecycleGate,
    });

    if (nav.redirectBlockedByPrompt) {
      const extra = {
        source: 'wizard_step_screen',
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
        event: 'step_corrected',
        rentalId: ctx.rentalId,
        source: 'wizard_step_screen',
        urlStep: step,
        logicalStep: nav.dest.step,
        path: nav.dest.path,
        hasPendingLifecyclePrompt,
      });
      router.replace(nav.dest.path as `/rental-wizard/${string}/s/${string}`);
    }
  }, [ctx, hasPendingLifecyclePrompt, lifecycleGate, router, step]);

  if (!step) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={ui.primary} />
      </View>
    );
  }

  return <RentalWizardStepView step={step} />;
}
