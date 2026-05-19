import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { useRentalWizard } from '@/components/rentalWizard/RentalWizardProvider';
import { WizardCelebrationTransitionShell } from '@/components/rentalWizard/shells/WizardCelebrationTransitionShell';
import { WizardCelebrationHero } from '@/components/rentalWizard/shared/WizardCelebrationHero';
import { WizardJourneyStepsList } from '@/components/rentalWizard/shared/WizardJourneyStepsList';
import { WizardRentalSummaryCard } from '@/components/rentalWizard/WizardRentalSummaryCard';
import { ui } from '@/constants/appUi';
import { wizardLayout } from '@/constants/wizardLayout';
import { formatBorrowingFromOwner } from '@/lib/rentalWizard/formatBorrowingFromOwner';
import { buildRentalConfirmedSummaryDisplay } from '@/lib/rentalWizard/formatRentalConfirmedSummary';

const JOURNEY_STEPS = [
  {
    icon: 'location-outline' as const,
    title: 'Coordinate pickup',
    body: 'Set a meetup location and handoff time with the owner.',
  },
  {
    icon: 'chatbubbles-outline' as const,
    title: 'Stay connected',
    body: 'Message the owner anytime if plans or timing change.',
  },
  {
    icon: 'return-down-back-outline' as const,
    title: 'Guided return',
    body: "We'll guide you through the return process when the rental ends.",
  },
];

export function RentalConfirmedTransitionStep() {
  const router = useRouter();
  const w = useRentalWizard();
  const { ctx } = w;
  const summary = buildRentalConfirmedSummaryDisplay(ctx);
  const ownerLine = formatBorrowingFromOwner(ctx.ownerDisplayName);
  const messageLabel = `Message ${summary.ownerShort}`;

  return (
    <WizardCelebrationTransitionShell
      onBack={() => router.back()}
      onOpenMessages={w.openMessages}
      primaryLabel="Coordinate pickup"
      primaryShowArrow
      onPrimary={() => void w.advanceAfterTransition('transition_rental_confirmed')}
      outlinedSecondaryLabel={messageLabel}
      onOutlinedSecondary={w.openMessages}
      tertiaryLabel="View rental details"
      onTertiary={() => w.openAdvancedDetails()}
    >
      <WizardCelebrationHero
        headline="Your rental is confirmed!"
        support={
          <Text style={styles.support}>
            You&apos;ve got the item. Now let&apos;s coordinate pickup details with{' '}
            <Text style={styles.ownerAccent}>{summary.ownerShort}</Text>
          </Text>
        }
      />

      <WizardRentalSummaryCard
        title={ctx.displayTitle}
        ownerLine={ownerLine}
        rentalCode={ctx.rentalCodeLabel}
        thumbUri={ctx.heroImageUrl}
        dateRange={summary.dateRange}
        durationDays={summary.durationDays}
        handoffTitle={summary.handoffTitle}
        handoffSubtitle={summary.handoffSubtitle}
        handoffIcon={summary.handoffIcon}
      />

      <WizardJourneyStepsList title="What happens next?" steps={JOURNEY_STEPS} />
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
  ownerAccent: {
    color: '#16A34A',
    fontWeight: '700',
  },
});
