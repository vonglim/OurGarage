import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { useOwnerRentalWizard } from '@/components/ownerRentalWizard/OwnerRentalWizardProvider';
import { WizardCelebrationTransitionShell } from '@/components/rentalWizard/shells/WizardCelebrationTransitionShell';
import { WizardCelebrationHero } from '@/components/rentalWizard/shared/WizardCelebrationHero';
import { WizardJourneyStepsList } from '@/components/rentalWizard/shared/WizardJourneyStepsList';
import { WizardRentalSummaryCard } from '@/components/rentalWizard/WizardRentalSummaryCard';
import { ui } from '@/constants/appUi';
import { wizardLayout } from '@/constants/wizardLayout';
import {
  buildRentalConfirmedSummaryDisplay,
  formatOwnerShortLabel,
} from '@/lib/rentalWizard/formatRentalConfirmedSummary';

const OWNER_CONFIRMED_JOURNEY = [
  {
    icon: 'location-outline' as const,
    title: 'Coordinate pickup',
    body: 'Set the meetup location and handoff time with your renter.',
  },
  {
    icon: 'camera-outline' as const,
    title: 'Upload timestamp proof (Required)',
    body: "Document the item's condition before pickup.",
  },
  {
    icon: 'construct-outline' as const,
    title: 'Prepare the item',
    body: 'Charge batteries, gather accessories, clean the item, and verify all included parts.',
  },
  {
    icon: 'calendar-outline' as const,
    title: 'Meetup day',
    body: 'Meet the renter and complete the pickup handoff.',
  },
];

export function OwnerRentalConfirmedTransitionStep() {
  const router = useRouter();
  const w = useOwnerRentalWizard();
  const { ctx } = w;
  const summary = buildRentalConfirmedSummaryDisplay(ctx);
  const renterShort = formatOwnerShortLabel(ctx.counterpartyDisplayName);
  const messageLabel = `Message ${renterShort}`;

  return (
    <WizardCelebrationTransitionShell
      onBack={() => router.back()}
      onOpenMessages={w.openMessages}
      primaryLabel="Coordinate pickup"
      primaryShowArrow
      onPrimary={() => void w.advanceAfterTransition('transition_rental_confirmed')}
      outlinedSecondaryLabel={messageLabel}
      onOutlinedSecondary={w.openMessages}
      tertiaryLabel="Rental details"
      onTertiary={() => w.openWorkspaceDetails()}
    >
      <WizardCelebrationHero
        headline="Booking confirmed"
        support={
          <Text style={styles.support}>
            You approved this rental. Coordinate pickup and get your item ready for{' '}
            <Text style={styles.renterAccent}>{renterShort}</Text>.
          </Text>
        }
      />

      <WizardRentalSummaryCard
        title={ctx.displayTitle}
        ownerLine={`Rented by ${ctx.counterpartyDisplayName}`}
        rentalCode={ctx.rentalCodeLabel}
        thumbUri={ctx.heroImageUrl}
        dateRange={summary.dateRange}
        durationDays={summary.durationDays}
        handoffTitle={summary.handoffTitle}
        handoffSubtitle={summary.handoffSubtitle}
        handoffIcon={summary.handoffIcon}
      />

      <WizardJourneyStepsList title="What happens next?" steps={OWNER_CONFIRMED_JOURNEY} />
    </WizardCelebrationTransitionShell>
  );
}

const styles = StyleSheet.create({
  support: {
    fontSize: 16,
    fontWeight: '500',
    color: ui.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: wizardLayout.celebrationSupportMaxWidth,
  },
  renterAccent: {
    color: '#2563EB',
    fontWeight: '700',
  },
});
