import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Alert, Text, View } from 'react-native';

import { MeetupLifecycleShell } from '@/components/rentalLifecycle/MeetupLifecycleShell';
import { SecurityHoldPremiumCard } from '@/components/rentalWizard/authorization/SecurityHoldPremiumCard';
import { useRentalWizard } from '@/components/rentalWizard/RentalWizardProvider';
import { INSPECTION_INCOMPLETE_AUTH_MESSAGE } from '@/lib/rentalAuthorization/bindingAuthorizationGate';
import { resolveAuthorizationProgress } from '@/lib/rentalAuthorization/authorizationProgress';
import { canAccessBindingAuthorizationForContext } from '@/lib/pickupHandoffCompletion';
import { calculatePreauthAmount } from '@/lib/rentalProtection';

export function SecurityHoldAuthorizationStep() {
  const router = useRouter();
  const w = useRentalWizard();
  const { ctx } = w;
  const progress = useMemo(() => resolveAuthorizationProgress(ctx), [ctx]);
  const inspectionComplete = useMemo(
    () => canAccessBindingAuthorizationForContext(ctx),
    [ctx]
  );
  const replacementValue =
    ctx.listingSnapshot?.replacement_value ?? ctx.rental.price ?? 100;
  const holdAmount = calculatePreauthAmount(
    typeof replacementValue === 'number' ? replacementValue : Number(replacementValue) || 100
  );

  const onPrimary = () => {
    if (!inspectionComplete) {
      Alert.alert('Inspection required', INSPECTION_INCOMPLETE_AUTH_MESSAGE);
      return;
    }
    if (progress.securityHoldAuthorized) {
      void w.goToResolvedNext();
    } else {
      void w.authorizeSecurityHoldStep(holdAmount);
    }
  };

  return (
    <MeetupLifecycleShell
      phase="rental_authorization"
      progressIndex={1}
      title="Authorize security hold"
      subtitle="A temporary hold reserves funds for potential claims — it is not a charge today."
      onBack={() => router.back()}
      onOpenMessages={w.openMessages}
      primaryLabel={
        progress.securityHoldAuthorized
          ? 'Continue to signature'
          : w.authorizationBusy
            ? 'Authorizing…'
            : 'Authorize hold'
      }
      primaryDisabled={w.authorizationBusy || !inspectionComplete}
      primaryBusy={w.authorizationBusy}
      onPrimary={onPrimary}
      footerNote={
        inspectionComplete
          ? 'Released when the rental closes cleanly unless policy conditions apply.'
          : INSPECTION_INCOMPLETE_AUTH_MESSAGE
      }
    >
      {!inspectionComplete ? (
        <View style={{ paddingBottom: 8 }}>
          <Text style={{ fontSize: 14, color: '#9A3412', lineHeight: 20 }}>
            {INSPECTION_INCOMPLETE_AUTH_MESSAGE}
          </Text>
        </View>
      ) : null}
      <SecurityHoldPremiumCard holdAmount={holdAmount} authorized={progress.securityHoldAuthorized} />
    </MeetupLifecycleShell>
  );
}
