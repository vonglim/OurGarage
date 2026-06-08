import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';

import { AuthPremiumShell } from '@/components/rentalWizard/authorization/AuthPremiumShell';
import { ConditionInspectionPremium } from '@/components/rentalWizard/authorization/ConditionInspectionPremium';
import { EquipmentIdentityCard } from '@/components/rentalWizard/authorization/EquipmentIdentityCard';
import { PickupEvidenceReviewModal } from '@/components/rentalWizard/PickupEvidenceReviewModal';
import { useRentalWizard } from '@/components/rentalWizard/RentalWizardProvider';
import { buildEquipmentDisplay } from '@/lib/rentalAuthorization/authorizationJourney';
import { resolveAuthorizationProgress } from '@/lib/rentalAuthorization/authorizationProgress';

export function RentalAgreementStep() {
  const router = useRouter();
  const w = useRentalWizard();
  const { ctx } = w;
  const progress = useMemo(() => resolveAuthorizationProgress(ctx), [ctx]);
  const equipment = useMemo(() => buildEquipmentDisplay(ctx), [ctx]);
  const [conditionAck, setConditionAck] = useState(progress.equipmentConditionAcknowledged);
  const [reviewOpen, setReviewOpen] = useState(false);

  return (
    <>
      <AuthPremiumShell
        ctx={ctx}
        activeStep="rental_agreement"
        onBack={() => router.back()}
        onOpenMessages={w.openMessages}
        focalTitle="Confirm your rental"
        focalSubtitle="One item, one inspection — then we’ll walk through policies in plain language."
        trustMessage="Protected rental · Agreement securely stored"
        upNextLabel="Policy disclosures"
        upNextBody="Short summaries with optional details — built for confidence, not overwhelm."
        primaryLabel={w.authorizationBusy ? 'Saving…' : 'Continue'}
        primaryDisabled={!conditionAck || w.authorizationBusy}
        primaryBusy={w.authorizationBusy}
        onPrimary={() =>
          void w.completeRentalAgreementStep({ equipmentConditionAcknowledged: conditionAck })
        }
        secondaryLabel="Message owner"
        onSecondary={w.openMessages}
        footerNote="Agreement review is separate from payment authorization and signing."
      >
        <EquipmentIdentityCard
          display={equipment}
          thumbUri={ctx.heroImageUrl}
          rentalCode={ctx.rentalCodeLabel}
        />
        <ConditionInspectionPremium
          photos={ctx.ownerPickupEvidence}
          checked={conditionAck}
          onCheckedChange={setConditionAck}
          onOpenReview={() => setReviewOpen(true)}
        />
      </AuthPremiumShell>

      <PickupEvidenceReviewModal
        visible={reviewOpen}
        onClose={() => setReviewOpen(false)}
        photos={ctx.ownerPickupEvidence}
        ownerDisplayName={ctx.ownerDisplayName}
        onApprove={() => {
          setReviewOpen(false);
          void w.markPickupEvidenceReviewOpened();
          void w.markPhotosApproved();
        }}
        onRequestNewPhotos={() => setReviewOpen(false)}
        onReportConcern={() => w.openMessages()}
      />
    </>
  );
}
