import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { OwnerRentalWizardStepView } from '@/components/ownerRentalWizard/OwnerRentalWizardStepView';
import { useOwnerRentalWizard } from '@/components/ownerRentalWizard/OwnerRentalWizardProvider';
import { logScenario } from '@/lib/rentalLifecycle/scenarioDevLog';
import { ownerWizardStepFromSlug, resolveOwnerRentalWizardDestination } from '@/lib/ownerRentalWizard';
import { ui } from '@/constants/appUi';

export default function OwnerRentalWizardStepScreen() {
  const { step: rawStep } = useLocalSearchParams<{ step: string }>();
  const router = useRouter();
  const { ctx } = useOwnerRentalWizard();
  const slug = typeof rawStep === 'string' ? rawStep : '';
  const step = ownerWizardStepFromSlug(slug);

  useEffect(() => {
    if (!step) return;
    const dest = resolveOwnerRentalWizardDestination(ctx);
    if (dest.step !== step && dest.path) {
      logScenario('routing', {
        event: 'owner_step_corrected',
        rentalId: ctx.rentalId,
        source: 'owner_wizard_step_screen',
        urlStep: step,
        logicalStep: dest.step,
        path: dest.path,
      });
      router.replace(dest.path as `/owner-rental-wizard/${string}/s/${string}`);
    }
  }, [ctx, router, step]);

  if (!step) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={ui.primary} />
      </View>
    );
  }

  return <OwnerRentalWizardStepView step={step} />;
}
