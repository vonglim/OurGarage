import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';

import { MeetupLifecycleShell } from '@/components/rentalLifecycle/MeetupLifecycleShell';
import { SecurityHoldPremiumCard } from '@/components/rentalWizard/authorization/SecurityHoldPremiumCard';
import { useRentalWizard } from '@/components/rentalWizard/RentalWizardProvider';
import { calculatePreauthAmount } from '@/lib/rentalProtection';
import { resolveAuthorizationProgress } from '@/lib/rentalAuthorization/authorizationProgress';

export function SecurityHoldAuthorizationStep() {
  const router = useRouter();
  const w = useRentalWizard();
  const { ctx } = w;
  const progress = useMemo(() => resolveAuthorizationProgress(ctx), [ctx]);
  const replacementValue =
    ctx.listingSnapshot?.replacement_value ?? ctx.rental.price ?? 100;
  const holdAmount = calculatePreauthAmount(
    typeof replacementValue === 'number' ? replacementValue : Number(replacementValue) || 100
  );

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
      primaryDisabled={w.authorizationBusy}
      primaryBusy={w.authorizationBusy}
      onPrimary={() => {
        if (progress.securityHoldAuthorized) {
          void w.goToResolvedNext();
        } else {
          void w.authorizeSecurityHoldStep(holdAmount);
        }
      }}
      footerNote="Released when the rental closes cleanly unless policy conditions apply."
    >
      <SecurityHoldPremiumCard holdAmount={holdAmount} authorized={progress.securityHoldAuthorized} />
    </MeetupLifecycleShell>
  );
}
