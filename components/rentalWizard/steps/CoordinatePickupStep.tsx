import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { usePickupCoordinationAcceptedPromptSnapshotTrace } from '@/components/rentalWizard/hooks/usePickupCoordinationAcceptedPrompt';
import { useRentalWizard } from '@/components/rentalWizard/RentalWizardProvider';
import { WizardCoordinateStep } from '@/components/rentalWizard/WizardCoordinateStep';
import { WizardItemCard } from '@/components/rentalWizard/WizardItemCard';
import { WizardLightShell } from '@/components/rentalWizard/shells/WizardLightShell';
import { WizardLocationProposalSheet } from '@/components/rentalWizard/modals/WizardLocationProposalSheet';
import { WizardTimeProposalSheet } from '@/components/rentalWizard/modals/WizardTimeProposalSheet';
import { formatBorrowingFromOwner } from '@/lib/rentalWizard/formatBorrowingFromOwner';
import { buildCoordinateTimeSlots } from '@/lib/rentalWizard/buildCoordinateTimeSlots';
import {
  applyTimeToLockedMeetupDate,
  meetupDateHintForYmd,
  resolveLockedPickupSchedule,
} from '@/lib/rentalWizard/coordinateMeetupSchedule';
import { WIZARD_STEP_META } from '@/lib/rentalWizard/wizardStepMeta';
import {
  coordinatePickupDraftProgressPatch,
  isCoordinateDraftValid,
  locationCardTitleForDraft,
  mergeCoordinatePickupDraft,
  readCoordinatePickupDraft,
  wizardHandoffFromNegotiation,
  type WizardMeetupProposalDraft,
} from '@/lib/rentalWizard/wizardMeetupDraft';
import { updateWizardProgress } from '@/lib/rentalWizard';
import type { WizardFooterInlineAction } from '@/components/wizard/GuidedWizardChrome';

const WIZARD_MESSAGES_HELP =
  'Use Messages to discuss pickup location, pickup timing, or return timing with the owner.';

export function CoordinatePickupStep() {
  const router = useRouter();
  const w = useRentalWizard();
  const { ctx, hasPendingLifecyclePrompt } = w;
  const meta = WIZARD_STEP_META.coordinate_pickup;

  const [draft, setDraft] = useState<WizardMeetupProposalDraft>(() =>
    mergeCoordinatePickupDraft(ctx, readCoordinatePickupDraft(ctx.wizardProgress))
  );
  const [locationOpen, setLocationOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [suggestingChanges, setSuggestingChanges] = useState(false);

  usePickupCoordinationAcceptedPromptSnapshotTrace(ctx, true);

  const pickupCoordination = ctx.meetupCoordination.pickup;
  const waitingOnCounterparty =
    pickupCoordination.isPendingThisPhase && pickupCoordination.viewerIsProposer;
  const ownerProposalPending =
    pickupCoordination.isPendingThisPhase &&
    pickupCoordination.proposedByRole === 'owner' &&
    !pickupCoordination.viewerIsProposer;
  const reviewingOwnerProposal = ownerProposalPending && !suggestingChanges;

  useEffect(() => {
    setDraft(mergeCoordinatePickupDraft(ctx, readCoordinatePickupDraft(ctx.wizardProgress)));
  }, [
    ctx.rentalId,
    ctx.wizardProgress.coordinate_pickup_draft,
    ctx.rental.meetup_location,
    ctx.rental.meetup_time,
    ctx.rental.pickup_datetime,
    ctx.rental.return_datetime,
    ctx.rental.last_proposed_by,
    ctx.meetupCoordination.revision,
    ctx.meetupCoordination.pickup.dateTimeIso,
    ctx.meetupCoordination.pickup.status,
  ]);

  useEffect(() => {
    if (!ownerProposalPending) {
      setSuggestingChanges(false);
    }
  }, [ownerProposalPending]);

  useEffect(() => {
    if (hasPendingLifecyclePrompt) {
      setLocationOpen(false);
      setTimeOpen(false);
    }
  }, [hasPendingLifecyclePrompt]);

  const persistDraft = useCallback(
    (next: WizardMeetupProposalDraft) => {
      setDraft(next);
      void updateWizardProgress(ctx.rentalId, ctx.viewerUserId, coordinatePickupDraftProgressPatch(next));
    },
    [ctx.rentalId, ctx.viewerUserId]
  );

  const patchDraft = useCallback(
    (patch: Partial<WizardMeetupProposalDraft>) => {
      persistDraft({ ...draft, ...patch });
    },
    [draft, persistDraft]
  );

  const agreedMethod = wizardHandoffFromNegotiation(ctx.agreedDeliveryMethod);
  const lockedPickupSchedule = useMemo(() => resolveLockedPickupSchedule(ctx), [ctx]);

  const proposedLocation = pickupCoordination.location || draft.location;
  const proposedScheduleIso =
    pickupCoordination.dateTimeIso ?? ctx.pickupIso ?? draft.meetupTimeIso;

  const timeSlots = useMemo(
    () =>
      buildCoordinateTimeSlots({
        lockedSchedule: lockedPickupSchedule,
        ownerProposalIso: proposedScheduleIso,
        selectedIso: draft.meetupTimeIso,
      }),
    [draft.meetupTimeIso, lockedPickupSchedule, proposedScheduleIso]
  );

  const saveMeetupTime = useCallback(
    (iso: string) => {
      patchDraft({
        meetupTimeIso: applyTimeToLockedMeetupDate(lockedPickupSchedule.dateYmd, iso),
        timeEditedByRenter: true,
      });
    },
    [lockedPickupSchedule.dateYmd, patchDraft]
  );

  const displayLocation = reviewingOwnerProposal ? proposedLocation : draft.location;
  const scheduleIso = ctx.pickupCoordinationComplete
    ? ctx.pickupIso
    : reviewingOwnerProposal
      ? proposedScheduleIso
      : draft.meetupTimeIso;
  const canPropose =
    isCoordinateDraftValid(draft) && !waitingOnCounterparty && !ctx.pickupCoordinationComplete && !reviewingOwnerProposal;

  const handlePropose = async () => {
    if (!canPropose || hasPendingLifecyclePrompt) return;
    const ok = await w.submitCoordinatePickupProposal(draft);
    if (ok) {
      setSuggestingChanges(false);
      await w.refresh();
    }
  };

  const handleAccept = async () => {
    if (!reviewingOwnerProposal || hasPendingLifecyclePrompt || w.proposalBusy) return;
    const ok = await w.acceptCoordinatePickupProposal();
    if (ok) await w.refresh();
  };

  const footer = ((): {
    primaryLabel: string;
    primaryDisabled: boolean;
    onPrimary: () => void;
    inlineActions?: WizardFooterInlineAction[];
  } => {
    const openMessagesAction: WizardFooterInlineAction = {
      label: 'Open messages',
      onPress: w.openMessages,
      emphasis: 'tertiary',
    };

    if (ctx.pickupCoordinationComplete) {
      return {
        primaryLabel: 'Continue',
        primaryDisabled: hasPendingLifecyclePrompt,
        onPrimary: () => {
          if (hasPendingLifecyclePrompt) return;
          void w.goToResolvedNext();
        },
        inlineActions: [openMessagesAction],
      };
    }
    if (reviewingOwnerProposal) {
      return {
        primaryLabel: w.proposalBusy ? 'Accepting…' : 'Accept pickup details',
        primaryDisabled: hasPendingLifecyclePrompt || w.proposalBusy,
        onPrimary: () => void handleAccept(),
        inlineActions: [
          {
            label: 'Suggest changes',
            onPress: () => setSuggestingChanges(true),
            emphasis: 'secondary',
            disabled: w.proposalBusy,
          },
          openMessagesAction,
        ],
      };
    }
    if (suggestingChanges && ownerProposalPending) {
      return {
        primaryLabel: w.proposalBusy ? 'Sending…' : 'Send counter-proposal',
        primaryDisabled: hasPendingLifecyclePrompt || !canPropose || w.proposalBusy,
        onPrimary: () => void handlePropose(),
        inlineActions: [
          {
            label: 'Back to review',
            onPress: () => setSuggestingChanges(false),
            emphasis: 'secondary',
            disabled: w.proposalBusy,
          },
          openMessagesAction,
        ],
      };
    }
    if (waitingOnCounterparty) {
      return {
        primaryLabel: 'Waiting for owner',
        primaryDisabled: true,
        onPrimary: () => {},
        inlineActions: [openMessagesAction],
      };
    }
    return {
      primaryLabel: 'Propose',
      primaryDisabled: hasPendingLifecyclePrompt || !canPropose || w.proposalBusy,
      onPrimary: () => void handlePropose(),
      inlineActions: [openMessagesAction],
    };
  })();

  const fieldsLocked =
    ctx.pickupCoordinationComplete ||
    waitingOnCounterparty ||
    reviewingOwnerProposal ||
    hasPendingLifecyclePrompt;

  return (
    <>
      <WizardLightShell
        title={meta.title}
        subtitle="Agree on how and where you'll get the item from the owner."
        onBack={() => router.back()}
        onOpenMessages={w.openMessages}
        primaryLabel={footer.primaryLabel}
        primaryDisabled={footer.primaryDisabled}
        onPrimary={footer.onPrimary}
        footerInlineActions={footer.inlineActions}
        footerCompact
      >
        <WizardItemCard
          title={ctx.displayTitle}
          ownerLine={formatBorrowingFromOwner(ctx.ownerDisplayName)}
          rentalCode={ctx.rentalCodeLabel}
          thumbUri={ctx.heroImageUrl}
        />
        <WizardCoordinateStep
          phase="pickup"
          agreedMethod={agreedMethod}
          agreedDeliveryFee={ctx.agreedDeliveryFee}
          method={draft.method}
          onMethodChange={(method) => patchDraft({ method })}
          location={displayLocation}
          locationCardTitle={
            reviewingOwnerProposal
              ? "Owner's proposed location"
              : locationCardTitleForDraft(draft, 'pickup')
          }
          onPressLocation={() => setLocationOpen(true)}
          scheduleIso={scheduleIso}
          lockFields={fieldsLocked}
          waitingForOwner={waitingOnCounterparty}
          waitingBannerText="Your pickup proposal was sent. The owner will review it here."
          ownerProposalPending={reviewingOwnerProposal}
          ownerProposalBannerText="Pickup proposal pending — review the owner's proposed location and time below."
          messagesHelpText={
            reviewingOwnerProposal || suggestingChanges || waitingOnCounterparty
              ? WIZARD_MESSAGES_HELP
              : undefined
          }
          meetupDateHint={
            !ctx.pickupCoordinationComplete && !waitingOnCounterparty && !reviewingOwnerProposal
              ? meetupDateHintForYmd(lockedPickupSchedule.dateYmd)
              : undefined
          }
          timeSlots={timeSlots}
          selectedTimeIso={draft.meetupTimeIso}
          onSelectTimeSlot={saveMeetupTime}
          onPressTime={() => setTimeOpen(true)}
        />
      </WizardLightShell>

      <WizardLocationProposalSheet
        visible={locationOpen}
        initialValue={draft.location}
        onClose={() => setLocationOpen(false)}
        onSave={(location) =>
          patchDraft({
            location,
            locationEditedByRenter: true,
          })
        }
      />

      <WizardTimeProposalSheet
        visible={timeOpen}
        initialIso={draft.meetupTimeIso}
        lockedDateYmd={lockedPickupSchedule.dateYmd}
        title="Choose meetup time"
        dateHint={meetupDateHintForYmd(lockedPickupSchedule.dateYmd)}
        onClose={() => setTimeOpen(false)}
        onSave={saveMeetupTime}
      />
    </>
  );
}
