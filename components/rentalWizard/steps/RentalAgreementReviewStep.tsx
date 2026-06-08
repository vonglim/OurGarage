import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';

import { MeetupLifecycleShell } from '@/components/rentalLifecycle/MeetupLifecycleShell';
import { RentalAgreementReviewContent } from '@/components/rentalWizard/RentalAgreementReviewContent';
import { useRentalWizard } from '@/components/rentalWizard/RentalWizardProvider';
import { resolveMeetupLifecyclePresentation } from '@/lib/rentalLifecycle/meetupLifecycle';

export function RentalAgreementReviewStep() {
  const router = useRouter();
  const w = useRentalWizard();
  const { ctx } = w;

  const presentation = useMemo(
    () => resolveMeetupLifecyclePresentation(ctx, 'renter'),
    [ctx]
  );

  return (
    <MeetupLifecycleShell
      phase="rental_authorization"
      progressIndex={1}
      title="Rental agreement"
      subtitle="Expand each section to review. One tap confirms you’ve read the agreement."
      onBack={() => router.back()}
      onOpenMessages={w.openMessages}
      primaryLabel={w.authorizationBusy ? 'Saving…' : "I've reviewed the agreement"}
      onPrimary={() => void w.completeUnifiedAgreementReview()}
      primaryDisabled={w.authorizationBusy}
      primaryBusy={w.authorizationBusy}
      footerNote="Authorization hold and signature are the next steps — not a charge today."
    >
      <RentalAgreementReviewContent
        ctx={ctx}
        showSummaryCard
        hint={presentation.renterSupport}
      />
    </MeetupLifecycleShell>
  );
}
