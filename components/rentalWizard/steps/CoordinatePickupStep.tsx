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

  usePickupCoordinationAcceptedPromptSnapshotTrace(ctx, true);

  useEffect(() => {
    setDraft(mergeCoordinatePickupDraft(ctx, readCoordinatePickupDraft(ctx.wizardProgress)));
  }, [ctx.rentalId, ctx.wizardProgress.coordinate_pickup_draft, ctx.rental.meetup_location, ctx.rental.meetup_time]);

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
  const waitingForOwner =
    ctx.hasPendingProposal && String(ctx.rental.last_proposed_by ?? '').trim() === ctx.viewerUserId;

  const lockedPickupSchedule = useMemo(() => resolveLockedPickupSchedule(ctx), [ctx]);

  const timeSlots = useMemo(
    () =>
      buildCoordinateTimeSlots({
        lockedSchedule: lockedPickupSchedule,
        ownerProposalIso: ctx.pickupIso,
        selectedIso: draft.meetupTimeIso,
      }),
    [ctx.pickupIso, draft.meetupTimeIso, lockedPickupSchedule]
  );

  const saveMeetupTime = useCallback(
    (iso: string) => {
      patchDraft({
        meetupTimeIso: applyTimeToLockedMeetupDate(lockedPickupSchedule.dateYmd, iso),
      });
    },
    [lockedPickupSchedule.dateYmd, patchDraft]
  );

  const scheduleIso = ctx.meetingCompleted ? ctx.pickupIso : draft.meetupTimeIso;
  const canPropose = isCoordinateDraftValid(draft) && !waitingForOwner && !ctx.meetingCompleted;

  const handlePropose = async () => {
    if (!canPropose || hasPendingLifecyclePrompt) return;
    const ok = await w.submitCoordinatePickupProposal(draft);
    if (ok) await w.refresh();
  };

  return (
    <>
      <WizardLightShell
        title={meta.title}
        subtitle="Agree on how and where you'll get the item from the owner."
        onBack={() => router.back()}
        onOpenMessages={w.openMessages}
        primaryLabel={ctx.meetingCompleted ? 'Continue' : waitingForOwner ? 'Waiting for owner' : 'Propose'}
        primaryDisabled={
          hasPendingLifecyclePrompt
            ? true
            : ctx.meetingCompleted
              ? false
              : waitingForOwner
                ? true
                : !canPropose || w.proposalBusy
        }
        onPrimary={() => {
          if (hasPendingLifecyclePrompt) return;
          if (ctx.meetingCompleted) void w.goToResolvedNext();
          else if (!waitingForOwner) void handlePropose();
        }}
        secondaryLabel="Open messages"
        onSecondary={w.openMessages}
        footerNote={
          waitingForOwner
            ? 'Your proposal was sent. The owner will review pickup details in Messages.'
            : ctx.meetingCompleted
              ? undefined
              : 'The owner will be notified of your proposal.'
        }
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
          location={draft.location}
          locationCardTitle={locationCardTitleForDraft(draft, 'pickup')}
          onPressLocation={() => setLocationOpen(true)}
          scheduleIso={scheduleIso}
          lockFields={ctx.meetingCompleted || waitingForOwner || hasPendingLifecyclePrompt}
          waitingForOwner={waitingForOwner}
          meetupDateHint={
            !ctx.meetingCompleted && !waitingForOwner
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
