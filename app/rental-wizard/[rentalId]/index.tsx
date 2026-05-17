import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useRentalWizard } from '@/components/rentalWizard/RentalWizardProvider';
import { resolveRentalWizardDestination } from '@/lib/rentalWizard';
import { ui } from '@/constants/appUi';

/** Entry: resolve current wizard step and redirect to the step route. */
export default function RentalWizardEntryScreen() {
  const router = useRouter();
  const { rentalId: rawId } = useLocalSearchParams<{ rentalId: string }>();
  const rentalId = typeof rawId === 'string' ? rawId : '';
  const { ctx } = useRentalWizard();

  useEffect(() => {
    const dest = resolveRentalWizardDestination(ctx);
    router.replace(dest.path as `/rental-wizard/${string}/s/${string}`);
  }, [ctx, rentalId, router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={ui.primary} />
    </View>
  );
}
