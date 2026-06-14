import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Alert, Text, View } from 'react-native';

import { MeetupLifecycleShell } from '@/components/rentalLifecycle/MeetupLifecycleShell';
import { RentalAgreementReviewContent } from '@/components/rentalWizard/RentalAgreementReviewContent';
import { useRentalWizard } from '@/components/rentalWizard/RentalWizardProvider';
import { INSPECTION_INCOMPLETE_AUTH_MESSAGE } from '@/lib/rentalAuthorization/bindingAuthorizationGate';
import { resolveMeetupLifecyclePresentation } from '@/lib/rentalLifecycle/meetupLifecycle';
import { canAccessBindingAuthorizationForContext } from '@/lib/pickupHandoffCompletion';

export function RentalAgreementReviewStep() {
  const router = useRouter();
  const w = useRentalWizard();
  const { ctx } = w;

  const inspectionComplete = useMemo(
    () => canAccessBindingAuthorizationForContext(ctx),
    [ctx]
  );

  const presentation = useMemo(
    () => resolveMeetupLifecyclePresentation(ctx, 'renter'),
    [ctx]
  );

  const onPrimary = () => {
    if (!inspectionComplete) {
      Alert.alert('Inspection required', INSPECTION_INCOMPLETE_AUTH_MESSAGE);
      return;
    }
    void w.completeUnifiedAgreementReview();
  };

  return (
    <MeetupLifecycleShell
      phase="rental_authorization"
      progressIndex={1}
      title="Rental agreement"
      subtitle="Expand each section to review. One tap confirms you’ve read the agreement."
      onBack={() => router.back()}
      onOpenMessages={w.openMessages}
      primaryLabel={w.authorizationBusy ? 'Saving…' : "I've reviewed the agreement"}
      onPrimary={onPrimary}
      primaryDisabled={w.authorizationBusy || !inspectionComplete}
      primaryBusy={w.authorizationBusy}
      footerNote={
        inspectionComplete
          ? 'Authorization hold and signature are the next steps — not a charge today.'
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
      <RentalAgreementReviewContent
        ctx={ctx}
        showSummaryCard
        hint={presentation.renterSupport}
      />
    </MeetupLifecycleShell>
  );
}
