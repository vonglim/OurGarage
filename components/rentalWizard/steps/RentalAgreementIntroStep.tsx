import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';

import { AuthMilestoneScreen } from '@/components/rentalWizard/authorization/AuthMilestoneScreen';
import { useRentalWizard } from '@/components/rentalWizard/RentalWizardProvider';
import { buildEquipmentDisplay } from '@/lib/rentalAuthorization/authorizationJourney';
import type { AuthorizationMilestoneConfig } from '@/lib/rentalAuthorization/authorizationMilestones';

const INTRO_CONFIG: AuthorizationMilestoneConfig = {
  step: 'rental_agreement_intro',
  seenKey: 'agreement_reviewed_seen',
  gradient: ['#0F172A', '#1E293B', '#334155'],
  icon: 'shield-checkmark-outline',
  iconTint: '#C7D2FE',
  headline: "You're almost ready",
  support:
    'Before pickup, review your rental agreement, protection details, and authorization. Most of this can be done before meetup day.',
  trustLines: [
    'Protected rental',
    'Both renter and owner are protected',
  ],
  primaryLabel: 'Review agreement',
  nextStep: 'rental_agreement',
};

export function RentalAgreementIntroStep() {
  const router = useRouter();
  const w = useRentalWizard();
  const equipment = useMemo(() => buildEquipmentDisplay(w.ctx), [w.ctx]);

  return (
    <AuthMilestoneScreen
      config={{
        ...INTRO_CONFIG,
        support: `${INTRO_CONFIG.support}\n\n${equipment.title} · ${equipment.dateRange}`,
      }}
      onBack={() => router.back()}
      onContinue={() => void w.beginRentalAgreementIntro()}
    />
  );
}
