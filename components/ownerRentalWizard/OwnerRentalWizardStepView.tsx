import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useOwnerRentalWizard } from '@/components/ownerRentalWizard/OwnerRentalWizardProvider';
import { OwnerCoordinatePickupStep } from '@/components/ownerRentalWizard/steps/OwnerCoordinatePickupStep';
import { OwnerCoordinateReturnStep } from '@/components/ownerRentalWizard/steps/OwnerCoordinateReturnStep';
import { OwnerMeetupHandoffStep } from '@/components/ownerRentalWizard/steps/OwnerMeetupHandoffStep';
import { OwnerPreparePickupStep } from '@/components/ownerRentalWizard/steps/OwnerPreparePickupStep';
import { OwnerPrepareReturnStep } from '@/components/ownerRentalWizard/steps/OwnerPrepareReturnStep';
import { OwnerRentalConfirmedTransitionStep } from '@/components/ownerRentalWizard/steps/OwnerRentalConfirmedTransitionStep';
import { OwnerWizardShell } from '@/components/ownerRentalWizard/OwnerWizardShell';
import { OwnerMeetupLifecyclePanel } from '@/components/rentalLifecycle/OwnerMeetupLifecyclePanel';
import { MeetupLifecycleShell } from '@/components/rentalLifecycle/MeetupLifecycleShell';
import { WizardItemCard } from '@/components/rentalWizard/WizardItemCard';
import { WizardDarkMeetupCards } from '@/components/rentalWizard/shared/WizardMeetupCards';
import { WizardTransitionConfirmedDetails } from '@/components/rentalWizard/shared/WizardTransitionConfirmedDetails';
import { WizardMeetupScheduleCard } from '@/components/rentalWizard/shared/WizardMeetupScheduleCard';
import { WizardLightShell } from '@/components/rentalWizard/shells/WizardLightShell';
import { WizardTransitionShell } from '@/components/rentalWizard/shells/WizardTransitionShell';
import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';
import type { OwnerRentalWizardStep } from '@/lib/ownerRentalWizard/types';
import { resolveOwnerMeetupPresentation } from '@/lib/ownerRentalWizard';
import { OWNER_WIZARD_STEP_META } from '@/lib/ownerRentalWizard/ownerWizardStepMeta';
import { formatWizardDateTime } from '@/lib/rentalWizard/formatWizardSchedule';

export type OwnerRentalWizardStepViewProps = {
  step: OwnerRentalWizardStep;
};

export function OwnerRentalWizardStepView({ step }: OwnerRentalWizardStepViewProps) {
  const router = useRouter();
  const w = useOwnerRentalWizard();
  const { ctx } = w;
  const meta = OWNER_WIZARD_STEP_META[step];

  const itemCardProps = {
    title: ctx.displayTitle,
    ownerLine: `Rented by ${ctx.counterpartyDisplayName}`,
    rentalCode: ctx.rentalCodeLabel,
    thumbUri: ctx.heroImageUrl,
  };

  const meetupPresentation = useMemo(() => resolveOwnerMeetupPresentation(ctx), [ctx]);

  switch (step) {
    case 'cancelled':
      return (
        <OwnerWizardShell
          phase="coordination"
          title="Rental cancelled"
          primaryLabel="View summary"
          onPrimary={() => router.replace('/(tabs)/activity')}
          onBack={() => router.back()}
        >
          <Text style={styles.body}>This rental was cancelled.</Text>
        </OwnerWizardShell>
      );

    case 'transition_rental_confirmed':
      return <OwnerRentalConfirmedTransitionStep />;

    case 'coordinate_pickup':
      return <OwnerCoordinatePickupStep />;

    case 'transition_pickup_confirmed':
      return (
        <WizardTransitionShell
          hideHeaderTitle
          headline="Great! Pickup details confirmed"
          subheadline="You and the renter have agreed on the pickup location and handoff time. Next, let's confirm where and when the item will be returned."
          iconTint="green"
          onBack={() => router.back()}
          onOpenMessages={w.openMessages}
          primaryLabel={meta.continueLabel}
          onPrimary={() => void w.advanceAfterTransition('transition_pickup_confirmed')}
        >
          <WizardTransitionConfirmedDetails
            phase="pickup"
            location={ctx.rental.meetup_location}
            scheduleIso={ctx.pickupIso}
          />
        </WizardTransitionShell>
      );

    case 'coordinate_return':
      return <OwnerCoordinateReturnStep />;

    case 'transition_return_confirmed':
      return (
        <WizardTransitionShell
          hideHeaderTitle
          headline="Return location and time set"
          subheadline="You and the renter have agreed on return details. Next, we'll get your item ready for pickup day."
          iconTint="green"
          onBack={() => router.back()}
          onOpenMessages={w.openMessages}
          primaryLabel={meta.continueLabel}
          onPrimary={() => void w.advanceAfterTransition('transition_return_confirmed')}
        >
          <WizardTransitionConfirmedDetails
            phase="return"
            location={ctx.rental.return_location ?? ctx.rental.meetup_location}
            scheduleIso={ctx.returnIso}
          />
        </WizardTransitionShell>
      );

    case 'transition_all_set':
      return (
        <WizardTransitionShell
          title="All set for pickup & return"
          headline="You and the renter are all set for pickup and return."
          subheadline="Pickup and return details are confirmed. Next, prepare your item for meetup day."
          iconTint="green"
          onBack={() => router.back()}
          onOpenMessages={w.openMessages}
          primaryLabel={meta.continueLabel}
          onPrimary={() => void w.advanceAfterTransition('transition_all_set')}
        >
          <WizardDarkMeetupCards ctx={ctx} />
        </WizardTransitionShell>
      );

    case 'owner_prepare_pickup':
      return <OwnerPreparePickupStep />;

    case 'transition_pickup_ready':
      return (
        <WizardTransitionShell
          title="Pickup ready"
          headline="Your item is ready for meetup day"
          subheadline="Pickup and return details are confirmed. The renter can now meet you for pickup."
          iconTint="green"
          onBack={() => router.back()}
          onOpenMessages={w.openMessages}
          primaryLabel={meta.continueLabel}
          onPrimary={() => void w.advanceAfterTransition('transition_pickup_ready')}
        >
          <WizardDarkMeetupCards ctx={ctx} />
        </WizardTransitionShell>
      );

    case 'owner_meetup_handoff':
      return <OwnerMeetupHandoffStep />;

    case 'owner_authorization_observe':
      return (
        <MeetupLifecycleShell
          phase={meetupPresentation.phase}
          progressIndex={meetupPresentation.progressIndex}
          title={meta.title}
          subtitle="The renter is completing agreement and authorization on their device. No action needed from you right now."
          onBack={() => router.back()}
          onOpenMessages={w.openMessages}
          primaryLabel="Message renter"
          onPrimary={w.openMessages}
        >
          <WizardItemCard {...itemCardProps} />
          <OwnerMeetupLifecyclePanel
            presentation={meetupPresentation}
            onMessageRenter={w.openMessages}
          />
        </MeetupLifecycleShell>
      );

    case 'transition_rental_active':
      return (
        <MeetupLifecycleShell
          phase="rental_active"
          progressIndex={2}
          title="Rental active"
          subtitle="The rental timer has started."
          onBack={() => router.back()}
          onOpenMessages={w.openMessages}
          primaryLabel={meta.continueLabel}
          onPrimary={() => void w.advanceAfterTransition('transition_rental_active')}
          secondaryLabel="Message renter"
          onSecondary={w.openMessages}
        >
          <View style={styles.hero}>
            <Ionicons name="checkmark-circle" size={64} color="#16A34A" />
            <Text style={styles.heroTitle}>Rental is now active</Text>
            <Text style={styles.heroBody}>
              The renter has the item. Return is due {formatWizardDateTime(ctx.returnIso)}.
            </Text>
          </View>
        </MeetupLifecycleShell>
      );

    case 'owner_active_rental':
      return (
        <MeetupLifecycleShell
          phase="rental_active"
          progressIndex={2}
          title={meta.title}
          subtitle={`Return due ${formatWizardDateTime(ctx.returnIso)}`}
          onBack={() => router.back()}
          onOpenMessages={w.openMessages}
          primaryLabel="Message renter"
          onPrimary={w.openMessages}
          secondaryLabel="Rental details"
          onSecondary={() => w.openWorkspaceDetails()}
        >
          <WizardItemCard {...itemCardProps} />
          <OwnerMeetupLifecyclePanel
            presentation={meetupPresentation}
            onMessageRenter={w.openMessages}
            onViewRental={() => w.openWorkspaceDetails()}
          />
        </MeetupLifecycleShell>
      );

    case 'transition_return_reminder':
      return (
        <WizardTransitionShell
          title="Return reminder"
          headline="Return window is coming up"
          subheadline="Be ready to meet the renter and inspect the item when they return it."
          icon="calendar-outline"
          onBack={() => router.back()}
          onOpenMessages={w.openMessages}
          primaryLabel={meta.continueLabel}
          onPrimary={() => void w.advanceAfterTransition('transition_return_reminder')}
        >
          <WizardMeetupScheduleCard
            pickupLabel="Return"
            pickupIso={ctx.returnIso}
            location={ctx.rental.return_location ?? ctx.rental.meetup_location}
          />
        </WizardTransitionShell>
      );

    case 'owner_prepare_return':
      return <OwnerPrepareReturnStep />;

    case 'owner_return_handoff': {
      const renterArrived = Boolean(ctx.wizardProgress.renter_return_im_here_at?.trim());
      return (
        <WizardLightShell
          title={meta.title}
          subtitle={
            renterArrived
              ? 'The renter is at the return meetup. Complete the inspection when you are ready.'
              : 'Waiting for the renter to arrive for the return meetup.'
          }
          onBack={() => router.back()}
          onOpenMessages={w.openMessages}
          primaryLabel={renterArrived ? meta.continueLabel : 'Message renter'}
          onPrimary={renterArrived ? () => w.openWorkspaceDetails('return') : w.openMessages}
          secondaryLabel={renterArrived ? 'Message renter' : undefined}
          onSecondary={renterArrived ? w.openMessages : undefined}
        >
          <View style={styles.hero}>
            <Ionicons
              name={renterArrived ? 'person-circle' : 'time-outline'}
              size={48}
              color="#6366F1"
            />
            <Text style={styles.heroTitle}>
              {renterArrived ? 'Renter has arrived' : 'Return meetup'}
            </Text>
          </View>
          <WizardMeetupScheduleCard
            pickupLabel="Return"
            pickupIso={ctx.returnIso}
            location={ctx.rental.return_location ?? ctx.rental.meetup_location}
            locationLabel="Return location"
          />
        </WizardLightShell>
      );
    }

    case 'transition_return_complete':
      return (
        <WizardTransitionShell
          title="Return complete"
          headline="Return complete"
          subheadline="The rental is closed. Thanks for hosting a great rental."
          iconTint="green"
          onBack={() => router.back()}
          onOpenMessages={w.openMessages}
          primaryLabel={meta.continueLabel}
          onPrimary={() => void w.advanceAfterTransition('transition_return_complete')}
        >
          <WhatsNextList
            items={[
              { icon: 'checkmark-circle', text: 'Rental closed' },
              { icon: 'card-outline', text: 'Preauthorization will be released' },
              { icon: 'notifications-outline', text: 'Renter notified' },
            ]}
          />
        </WizardTransitionShell>
      );

    case 'leave_review':
      return <OwnerLeaveReviewStep displayTitle={ctx.displayTitle} />;

    default:
      return null;
  }
}

function OwnerLeaveReviewStep({ displayTitle }: { displayTitle: string }) {
  const router = useRouter();
  const w = useOwnerRentalWizard();
  const [rating, setRating] = useState(0);

  return (
    <OwnerWizardShell
      phase="coordination"
      title="Leave a review"
      onBack={() => router.back()}
      primaryLabel="Submit review"
      onPrimary={() => router.replace('/(tabs)/activity')}
      primaryDisabled={rating < 1}
    >
      <Text style={styles.reviewItem}>{displayTitle}</Text>
      <Text style={styles.sectionLabel}>Rate your renter</Text>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} pressOpacityFeedback={false} onPress={() => setRating(n)}>
            <Ionicons
              name={n <= rating ? 'star' : 'star-outline'}
              size={32}
              color="#6366F1"
            />
          </Pressable>
        ))}
      </View>
      <Pressable pressOpacityFeedback={false} onPress={w.openMessages} style={styles.linkRow}>
        <Text style={styles.linkText}>Message renter instead</Text>
      </Pressable>
    </OwnerWizardShell>
  );
}

function InfoBanner({
  tone,
  title,
  body,
}: {
  tone: 'info' | 'warn';
  title: string;
  body: string;
}) {
  const bg = tone === 'warn' ? '#FEF9C3' : '#EFF6FF';
  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <Ionicons name="information-circle-outline" size={20} color={ui.primary} />
      <View style={styles.bannerText}>
        <Text style={styles.bannerTitle}>{title}</Text>
        <Text style={styles.bannerBody}>{body}</Text>
      </View>
    </View>
  );
}

function WhatsNextList({
  items,
}: {
  items: { icon: keyof typeof Ionicons.glyphMap; text: string }[];
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardHead}>What&apos;s next</Text>
      {items.map((item) => (
        <View key={item.text} style={styles.checkRow}>
          <Ionicons name={item.icon} size={18} color="#16A34A" />
          <Text style={styles.checkText}>{item.text}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 15, color: ui.textSecondary, lineHeight: 22 },
  hero: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  heroTitle: { fontSize: 20, fontWeight: '800', color: ui.textPrimary, textAlign: 'center' },
  heroBody: { fontSize: 14, color: ui.textSecondary, textAlign: 'center' },
  meetupHeadline: { fontSize: 22, fontWeight: '800', color: ui.textPrimary, marginBottom: 8 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    gap: 10,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  cardHead: { fontSize: 14, fontWeight: '700', color: ui.textPrimary },
  cardRow: { gap: 2 },
  cardLabel: { fontSize: 12, fontWeight: '600', color: ui.textSecondary },
  cardValue: { fontSize: 15, fontWeight: '600', color: ui.textPrimary },
  banner: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, marginBottom: 12 },
  bannerText: { flex: 1 },
  bannerTitle: { fontSize: 14, fontWeight: '700', color: ui.textPrimary },
  bannerBody: { fontSize: 13, color: ui.textSecondary, marginTop: 4, lineHeight: 18 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkText: { fontSize: 14, color: ui.textPrimary, flex: 1 },
  reviewItem: { fontSize: 17, fontWeight: '700', color: ui.textPrimary, marginBottom: 12 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: ui.textPrimary, marginBottom: 8 },
  stars: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  linkRow: { paddingVertical: 8 },
  linkText: { fontSize: 14, fontWeight: '600', color: ui.primary },
});
