import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';

import { AuthPremiumShell } from '@/components/rentalWizard/authorization/AuthPremiumShell';
import { PremiumDisclosureCard } from '@/components/rentalWizard/authorization/PremiumDisclosureCard';
import { useRentalWizard } from '@/components/rentalWizard/RentalWizardProvider';
import { resolveAuthorizationProgress } from '@/lib/rentalAuthorization/authorizationProgress';

const DISCLOSURE_CARDS = [
  {
    id: 'late_return',
    icon: 'time-outline' as const,
    iconTint: '#D97706',
    title: 'Late returns',
    summary: 'Fees may apply after your return window.',
    checkboxLabel: 'I accept the late return policy.',
  },
  {
    id: 'responsibility',
    icon: 'alert-circle-outline' as const,
    iconTint: '#DC2626',
    title: 'While you have it',
    summary: 'You’re responsible for proper care and lawful use.',
    bullets: ['Theft or loss', 'Negligent use', 'Unauthorized users'],
    fullDetails:
      'You may be charged for repair or replacement when damage, loss, or policy violations occur during your rental period.',
    checkboxLabel: 'I understand my responsibilities.',
  },
  {
    id: 'protection',
    icon: 'umbrella-outline' as const,
    iconTint: '#4F46E5',
    title: 'Protection',
    summary: 'Declining coverage may mean out-of-pocket costs.',
    checkboxLabel: 'I understand declined coverage responsibilities.',
  },
  {
    id: 'marketplace',
    icon: 'business-outline' as const,
    iconTint: '#64748B',
    title: 'Marketplace',
    summary: 'OurGarage connects you with the owner.',
    checkboxLabel: 'I understand platform marketplace terms.',
  },
  {
    id: 'owner_disclosure',
    icon: 'person-outline' as const,
    iconTint: '#059669',
    title: 'Owner disclosures',
    summary: 'Condition is described in listing and photos.',
    checkboxLabel: 'I acknowledge owner representations.',
  },
  {
    id: 'risk',
    icon: 'warning-outline' as const,
    iconTint: '#B45309',
    title: 'Inherent risk',
    summary: 'Some items carry operational risk.',
    requiresInitials: true,
    checkboxLabel: 'I accept inherent use risks.',
  },
] as const;

export function LiabilityDisclosuresStep() {
  const router = useRouter();
  const w = useRentalWizard();
  const { ctx } = w;
  const progress = useMemo(() => resolveAuthorizationProgress(ctx), [ctx]);

  const [checks, setChecks] = useState<Record<string, boolean>>({
    late_return: progress.liabilityDisclosuresAccepted,
    responsibility: progress.liabilityDisclosuresAccepted,
    protection: Boolean(ctx.rental.protection_declined_acknowledged_at),
    marketplace: progress.liabilityDisclosuresAccepted,
    owner_disclosure: progress.liabilityDisclosuresAccepted,
    risk: progress.liabilityDisclosuresAccepted,
  });
  const [initials, setInitials] = useState(
    () => ctx.wizardProgress.liability_risk_initials?.trim() ?? ''
  );

  useEffect(() => {
    const saved = ctx.wizardProgress.liability_risk_initials?.trim() ?? '';
    if (saved) setInitials(saved);
  }, [ctx.wizardProgress.liability_risk_initials]);

  const allChecked = DISCLOSURE_CARDS.every((c) => checks[c.id]);
  const riskOk = initials.trim().length >= 2;
  const canContinue = allChecked && riskOk;

  return (
    <AuthPremiumShell
      ctx={ctx}
      activeStep="liability_disclosures"
      onBack={() => router.back()}
      onOpenMessages={w.openMessages}
      focalTitle="Quick policy review"
      focalSubtitle="Six lightweight acknowledgments. Expand details only if you want them."
      trustMessage="Both renter and owner are protected"
      upNextLabel={
        progress.physicalPossessionConfirmed ? 'Security hold' : 'Pickup inspection'
      }
      upNextBody={
        progress.physicalPossessionConfirmed
          ? 'Authorize a temporary hold — not a charge today.'
          : 'Finish in-person inspection at meetup before the hold step.'
      }
      primaryLabel={w.authorizationBusy ? 'Saving…' : 'Accept & continue'}
      primaryDisabled={!canContinue || w.authorizationBusy}
      primaryBusy={w.authorizationBusy}
      onPrimary={() => {
        if (!canContinue) {
          Alert.alert('Almost there', 'Accept each item to continue.');
          return;
        }
        void w.completeLiabilityDisclosuresStep({
          lateFeePolicyAccepted: checks.late_return,
          protectionDeclinedAcknowledged: checks.protection,
          protectionCoverageAccepted: false,
          riskInitials: initials,
        });
      }}
      secondaryLabel="Back"
      onSecondary={() => w.goToWizardStep('rental_agreement')}
      footerNote="No charge unless policy conditions apply later."
    >
      {DISCLOSURE_CARDS.map((card) => (
        <PremiumDisclosureCard
          key={card.id}
          icon={card.icon}
          iconTint={'iconTint' in card ? card.iconTint : '#4F46E5'}
          title={card.title}
          summary={card.summary}
          bullets={'bullets' in card && card.bullets ? [...card.bullets] : undefined}
          fullDetails={'fullDetails' in card ? card.fullDetails : undefined}
          checked={Boolean(checks[card.id])}
          onCheckedChange={(v) => setChecks((prev) => ({ ...prev, [card.id]: v }))}
          checkboxLabel={card.checkboxLabel}
          requiresInitials={'requiresInitials' in card && card.requiresInitials}
          initials={initials}
          onInitialsChange={'requiresInitials' in card && card.requiresInitials ? setInitials : undefined}
          completed={Boolean(checks[card.id])}
        />
      ))}
    </AuthPremiumShell>
  );
}
