import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { RentalWizardStepView } from '@/components/rentalWizard/RentalWizardStepView';
import { useRentalWizard } from '@/components/rentalWizard/RentalWizardProvider';
import { logScenario } from '@/lib/rentalLifecycle/scenarioDevLog';
import { resolveRentalWizardDestination } from '@/lib/rentalWizard';
import { wizardStepFromSlug } from '@/lib/rentalWizard/wizardStepMeta';
import { ui } from '@/constants/appUi';

export default function RentalWizardStepScreen() {
  const { step: rawStep } = useLocalSearchParams<{ step: string }>();
  const router = useRouter();
  const { ctx } = useRentalWizard();
  const slug = typeof rawStep === 'string' ? rawStep : '';
  const step = wizardStepFromSlug(slug);

  useEffect(() => {
    if (!step) return;
    const dest = resolveRentalWizardDestination(ctx);
    if (dest.step !== step) {
      logScenario('routing', {
        event: 'step_corrected',
        rentalId: ctx.rentalId,
        source: 'wizard_step_screen',
        urlStep: step,
        logicalStep: dest.step,
        path: dest.path,
      });
      router.replace(dest.path as `/rental-wizard/${string}/s/${string}`);
    }
  }, [ctx, step, router]);

  if (!step) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={ui.primary} />
      </View>
    );
  }

  return <RentalWizardStepView step={step} />;
}
