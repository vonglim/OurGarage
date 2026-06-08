import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useRentalWizard } from '@/components/rentalWizard/RentalWizardProvider';
import { ui } from '@/constants/appUi';
import { resolveRentalWizardDestination } from '@/lib/rentalWizard';

/** Immediate redirect for deprecated meetup/auth URLs — no legacy UI rendered. */
export function LegacyMeetupStepRedirect() {
  const router = useRouter();
  const { ctx } = useRentalWizard();

  useEffect(() => {
    const dest = resolveRentalWizardDestination(ctx);
    if (dest.path) {
      router.replace(dest.path as `/rental-wizard/${string}/s/${string}`);
    }
  }, [ctx, router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={ui.primary} />
    </View>
  );
}
