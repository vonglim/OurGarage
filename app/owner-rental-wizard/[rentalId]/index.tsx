import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';

import { useOwnerRentalWizard } from '@/components/ownerRentalWizard/OwnerRentalWizardProvider';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ui } from '@/constants/appUi';
import { logRentalActivationSchema } from '@/lib/rentalActivationSchema';
import { resolveOwnerRentalWizardDestination } from '@/lib/ownerRentalWizard';

/** Entry: resolve current owner wizard step and redirect to the step route. */
export default function OwnerRentalWizardEntryScreen() {
  const router = useRouter();
  const { rentalId: rawId } = useLocalSearchParams<{ rentalId: string }>();
  const rentalId = typeof rawId === 'string' ? rawId : '';
  const { ctx } = useOwnerRentalWizard();
  const [redirectError, setRedirectError] = useState<string | null>(null);

  useEffect(() => {
    if (!ctx || !rentalId) return;
    setRedirectError(null);
    try {
      const dest = resolveOwnerRentalWizardDestination(ctx);
      router.replace(dest.path as `/owner-rental-wizard/${string}/s/${string}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not open owner guide step.';
      logRentalActivationSchema({
        rentalId,
        wizardBuildPhase: 'owner_wizard_entry_redirect',
        resolverCrashLocation: 'OwnerRentalWizardEntryScreen',
        error: message,
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
