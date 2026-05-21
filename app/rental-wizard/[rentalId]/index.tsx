import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';

import { ScreenWrapper } from '@/components/ScreenWrapper';
import { useRentalWizard } from '@/components/rentalWizard/RentalWizardProvider';
import { ui } from '@/constants/appUi';
import { logRentalActivationSchema } from '@/lib/rentalActivationSchema';
import { safeResolveRentalWizardDestination } from '@/lib/rentalWizard/rentalWizardStepResolver';

/** Entry: resolve current wizard step and redirect to the step route. */
export default function RentalWizardEntryScreen() {
  const router = useRouter();
  const { rentalId: rawId } = useLocalSearchParams<{ rentalId: string }>();
  const rentalId = typeof rawId === 'string' ? rawId : '';
  const { ctx } = useRentalWizard();
  const [redirectError, setRedirectError] = useState<string | null>(null);

  useEffect(() => {
    if (!ctx || !rentalId) return;
    setRedirectError(null);
    try {
      const dest = safeResolveRentalWizardDestination(ctx);
      router.replace(dest.path as `/rental-wizard/${string}/s/${string}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not open wizard step.';
      logRentalActivationSchema({
        rentalId,
        wizardBuildPhase: 'wizard_entry_redirect',
        resolverCrashLocation: 'RentalWizardEntryScreen',
        error: message,
        schemaDegraded: ctx.schemaDegraded,
        missingColumns: ctx.missingActivationColumns,
      });
      setRedirectError(message);
    }
  }, [ctx, rentalId, router]);

  if (redirectError) {
    return (
      <ScreenWrapper style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 15, color: ui.textSecondary, textAlign: 'center' }}>{redirectError}</Text>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={ui.primary} />
    </ScreenWrapper>
  );
}
