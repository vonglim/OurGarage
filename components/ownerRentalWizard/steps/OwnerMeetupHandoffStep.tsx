import React, { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useOwnerRentalWizard } from '@/components/ownerRentalWizard/OwnerRentalWizardProvider';
import { OwnerMeetupLifecyclePanel } from '@/components/rentalLifecycle/OwnerMeetupLifecyclePanel';
import { MeetupCountdownCard } from '@/components/rentalWizard/shared/MeetupCountdownCard';
import { WizardDarkMeetupCards } from '@/components/rentalWizard/shared/WizardMeetupCards';
import { WizardMeetupStatusBanner } from '@/components/rentalWizard/shared/WizardMeetupDayPanels';
import { WizardItemCard } from '@/components/rentalWizard/WizardItemCard';
import { WizardLightShell } from '@/components/rentalWizard/shells/WizardLightShell';
import { ui } from '@/constants/appUi';
import { resolveOwnerMeetupPresentation } from '@/lib/ownerRentalWizard';
import { OWNER_WIZARD_STEP_META } from '@/lib/ownerRentalWizard/ownerWizardStepMeta';
import {
  buildPickupHandoffCompletionInputFromWizard,
  resolvePickupHandoffCompletionState,
} from '@/lib/pickupHandoffCompletion';
import { canOwnerMarkImHereAtPickup } from '@/lib/pickupHandoffArrivalGates';
import { resolvePickupHandoffPresenceState } from '@/lib/pickupHandoffLive';

export function OwnerMeetupHandoffStep() {
  const w = useOwnerRentalWizard();
  const { ctx } = w;
  const meta = OWNER_WIZARD_STEP_META.owner_meetup_handoff;

  const completion = resolvePickupHandoffCompletionState(
    buildPickupHandoffCompletionInputFromWizard(ctx)
  );
  const handoffStarted = Boolean(
    ctx.rental.handoff_approval_started_at?.trim() || ctx.rental.handoff_approved_by_owner
  );
  const presence = resolvePickupHandoffPresenceState({
    rental: ctx.rental,
    renterPickupImHereAt: ctx.wizardProgress.renter_pickup_im_here_at,
    renterApprovedPickupPhotosAt: ctx.wizardProgress.renter_approved_pickup_photos_at,
    pickupAck: ctx.pickupAck,
    ownerPickupPrepComplete: true,
    handoffApprovalStarted: handoffStarted,
    handoffCompleted: ctx.pickupHandoffComplete,
    viewerRole: 'owner',
  });
  const presentation = useMemo(() => resolveOwnerMeetupPresentation(ctx), [ctx]);
  const renterHere =
    presence.renterArrived || Boolean(ctx.wizardProgress.renter_pickup_im_here_at?.trim());
  let headline = 'Meetup day';
  let subtitle = 'Meet the renter at the agreed location and complete the pickup handoff.';
  let statusBanner: { tone: 'waiting' | 'ready' | 'info'; title: string; body: string } | null =
    null;
  let primaryLabel = w.actionBusy ? 'Saving…' : 'Waiting for renter';
  let primaryOnPress: () => void = () => {};
  let primaryDisabled = true;

  if (presence.bothPresent && !completion.renterConfirmedReceipt) {
    headline = 'Equipment inspection';
    subtitle = 'The renter is inspecting the item. Answer questions while they review.';
    statusBanner = {
      tone: 'info',
      title: 'Handoff in progress',
      body: 'Both parties are at the meetup. The renter is reviewing the item before confirming receipt.',
    };
    primaryLabel = 'Message renter';
    primaryOnPress = () => w.openMessages();
    primaryDisabled = false;
  } else if (presence.ownerArrived && !renterHere) {
    headline = "You've arrived";
    subtitle = 'Waiting for the renter. Once they tap “I’m here”, you can complete the handoff.';
    statusBanner = {
      tone: 'waiting',
      title: "You're checked in",
      body: "You're checked in and waiting for the renter.",
    };
    primaryLabel = 'Message renter';
    primaryOnPress = () => w.openMessages();
    primaryDisabled = false;
  } else if (
    canOwnerMarkImHereAtPickup({
      renterArrived: presence.renterArrived,
      renterPickupImHereAt: ctx.wizardProgress.renter_pickup_im_here_at,
      ownerArrived: presence.ownerArrived,
      handoffApprovalStarted: handoffStarted,
    })
  ) {
    headline = 'Renter has arrived';
    subtitle = 'The renter is at the meetup location. Tap below when you are there too.';
    statusBanner = {
      tone: 'ready',
      title: 'Renter arrived',
      body: 'The renter has arrived. Meet them and begin the handoff.',
    };
    primaryLabel = w.actionBusy ? 'Saving…' : "I'm here";
    primaryOnPress = () => {
      void w.markOwnerImHere();
    };
    primaryDisabled = w.actionBusy;
  } else if (!renterHere) {
    statusBanner = {
      tone: 'waiting',
      title: 'Waiting for renter',
      body: 'The renter has not checked in yet.',
    };
    primaryLabel = 'Waiting for renter';
    primaryOnPress = () => {};
    primaryDisabled = true;
  }

  const showLifecyclePanel = presence.bothPresent && !completion.renterConfirmedReceipt;

  return (
    <WizardLightShell
      title={meta.title}
      subtitle={subtitle}
      onBack={() => w.goToResolvedNext()}
      onOpenMessages={w.openMessages}
      primaryLabel={primaryLabel}
      onPrimary={primaryOnPress}
      primaryDisabled={primaryDisabled || w.actionBusy}
      secondaryLabel="Message renter"
      onSecondary={w.openMessages}
    >
      <Text style={styles.headline}>{headline}</Text>
      <WizardItemCard
        title={ctx.displayTitle}
        ownerLine={`Rented by ${ctx.counterpartyDisplayName}`}
        rentalCode={ctx.rentalCodeLabel}
        thumbUri={ctx.heroImageUrl}
      />
      <WizardDarkMeetupCards ctx={ctx} />
      <MeetupCountdownCard pickupIso={ctx.pickupIso} />
      {statusBanner ? (
        <WizardMeetupStatusBanner
          tone={statusBanner.tone}
          title={statusBanner.title}
          body={statusBanner.body}
        />
      ) : null}
      {showLifecyclePanel ? (
        <OwnerMeetupLifecyclePanel presentation={presentation} onMessageRenter={w.openMessages} />
      ) : null}
    </WizardLightShell>
  );
}

const styles = StyleSheet.create({
  headline: { fontSize: 22, fontWeight: '800', color: ui.textPrimary, marginBottom: 4 },
});
