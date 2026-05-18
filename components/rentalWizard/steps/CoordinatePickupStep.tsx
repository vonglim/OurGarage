import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRentalWizard } from '@/components/rentalWizard/RentalWizardProvider';
import { WizardCoordinateStep } from '@/components/rentalWizard/WizardCoordinateStep';
import { WizardItemCard } from '@/components/rentalWizard/WizardItemCard';
import { WizardLightShell } from '@/components/rentalWizard/shells/WizardLightShell';
import { WizardLocationProposalSheet } from '@/components/rentalWizard/modals/WizardLocationProposalSheet';
import { WizardTimeProposalSheet } from '@/components/rentalWizard/modals/WizardTimeProposalSheet';
import { formatBorrowingFromOwner } from '@/lib/rentalWizard/formatBorrowingFromOwner';
import { buildCoordinateTimeSlots } from '@/lib/rentalWizard/buildCoordinateTimeSlots';
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
  const { ctx } = w;
  const meta = WIZARD_STEP_META.coordinate_pickup;

  const [draft, setDraft] = useState<WizardMeetupProposalDraft>(() =>
    mergeCoordinatePickupDraft(ctx, readCoordinatePickupDraft(ctx.wizardProgress))
  );
  const [locationOpen, setLocationOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);

  useEffect(() => {
    setDraft(mergeCoordinatePickupDraft(ctx, readCoordinatePickupDraft(ctx.wizardProgress)));
  }, [ctx.rentalId, ctx.wizardProgress.coordinate_pickup_draft, ctx.rental.meetup_location, ctx.rental.meetup_time]);

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

  const timeSlots = useMemo(
    () =>
      buildCoordinateTimeSlots({
        ownerProposalIso: ctx.pickupIso,
        rentalStartDate: ctx.scheduleHints.rentalStartDate,
        selectedIso: draft.meetupTimeIso,
      }),
    [ctx.pickupIso, ctx.scheduleHints.rentalStartDate, draft.meetupTimeIso]
  );

  const scheduleIso = ctx.meetingCompleted ? ctx.pickupIso : draft.meetupTimeIso;
  const canPropose = isCoordinateDraftValid(draft) && !waitingForOwner && !ctx.meetingCompleted;

  const handlePropose = async () => {
    if (!canPropose) return;
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
        primaryDisabled={ctx.meetingCompleted ? false : waitingForOwner ? true : !canPropose || w.proposalBusy}
        onPrimary={() => {
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
          lockFields={ctx.meetingCompleted || waitingForOwner}
          waitingForOwner={waitingForOwner}
          timeSlots={timeSlots}
          selectedTimeIso={draft.meetupTimeIso}
          onSelectTimeSlot={(iso) => patchDraft({ meetupTimeIso: iso })}
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
        onClose={() => setTimeOpen(false)}
        onSave={(iso) => patchDraft({ meetupTimeIso: iso })}
      />
    </>
  );
}
