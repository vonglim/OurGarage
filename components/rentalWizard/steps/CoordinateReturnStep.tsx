import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useReturnCoordinationAcceptedPromptSnapshotTrace } from '@/components/rentalWizard/hooks/useReturnCoordinationAcceptedPrompt';
import { useRentalWizard } from '@/components/rentalWizard/RentalWizardProvider';
import { WizardCoordinateStep } from '@/components/rentalWizard/WizardCoordinateStep';
import { WizardItemCard } from '@/components/rentalWizard/WizardItemCard';
import { WizardLightShell } from '@/components/rentalWizard/shells/WizardLightShell';
import { WizardLocationProposalSheet } from '@/components/rentalWizard/modals/WizardLocationProposalSheet';
import { WizardTimeProposalSheet } from '@/components/rentalWizard/modals/WizardTimeProposalSheet';
import {
  buildAcceptedPickupCoordination,
  isAcceptedPickupCoordinationReady,
} from '@/lib/rentalWizard/acceptedPickupCoordination';
import { formatBorrowingFromOwner } from '@/lib/rentalWizard/formatBorrowingFromOwner';
import { buildCoordinateTimeSlots } from '@/lib/rentalWizard/buildCoordinateTimeSlots';
import {
  applyTimeToLockedMeetupDate,
  meetupDateHintForYmd,
  resolveLockedReturnSchedule,
} from '@/lib/rentalWizard/coordinateMeetupSchedule';
import {
  buildInheritedReturnDefaults,
  logReturnMeetupDefaults,
} from '@/lib/rentalWizard/resolveReturnMeetupDefaults';
import { WIZARD_STEP_META } from '@/lib/rentalWizard/wizardStepMeta';
import {
  buildDefaultCoordinateReturnDraft,
  coordinateReturnDraftProgressPatch,
  hasCoordinateReturnChangesFromPickup,
  hasReturnChanges,
  isCoordinateDraftValid,
  mergeCoordinateReturnDraft,
  readCoordinateReturnDraft,
  returnLocationCardTitle,
  returnTimeCardTitle,
  wizardHandoffFromNegotiation,
  type CoordinateReturnInheritedDefaults,
  type WizardMeetupProposalDraft,
} from '@/lib/rentalWizard/wizardMeetupDraft';
import { updateWizardProgress } from '@/lib/rentalWizard';

function displayDraftFromDefaults(
  draft: WizardMeetupProposalDraft,
  inherited: CoordinateReturnInheritedDefaults,
  agreedMethod: ReturnType<typeof buildAcceptedPickupCoordination>
): WizardMeetupProposalDraft {
  return {
    ...draft,
    location: draft.locationEditedByRenter ? draft.location : draft.location.trim() || inherited.location,
    meetupTimeIso: draft.timeEditedByRenter
      ? draft.meetupTimeIso
      : draft.meetupTimeIso ?? inherited.meetupTimeIso,
    method: agreedMethod.method,
    agreedMethod: agreedMethod.method,
    agreedDeliveryFee: agreedMethod.deliveryFee,
  };
}

export function CoordinateReturnStep() {
  const router = useRouter();
  const w = useRentalWizard();
  const { ctx, hasPendingLifecyclePrompt } = w;
  const meta = WIZARD_STEP_META.coordinate_return;

  const pickupAccepted = useMemo(() => buildAcceptedPickupCoordination(ctx), [ctx]);
  const returnDefaults = useMemo(() => buildInheritedReturnDefaults(ctx), [ctx]);

  const [draft, setDraft] = useState<WizardMeetupProposalDraft>(() =>
    mergeCoordinateReturnDraft(ctx, readCoordinateReturnDraft(ctx.wizardProgress))
  );
  const [locationOpen, setLocationOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);

  useReturnCoordinationAcceptedPromptSnapshotTrace(ctx, true);

  useEffect(() => {
    if (hasPendingLifecyclePrompt) {
      setLocationOpen(false);
      setTimeOpen(false);
    }
  }, [hasPendingLifecyclePrompt]);

  const displayDraft = useMemo(
    () => displayDraftFromDefaults(draft, returnDefaults, pickupAccepted),
    [draft, returnDefaults, pickupAccepted]
  );

  useEffect(() => {
    logReturnMeetupDefaults(ctx, 'coordinate_return_mount');
  }, [ctx]);

  useEffect(() => {
    const merged = mergeCoordinateReturnDraft(ctx, readCoordinateReturnDraft(ctx.wizardProgress));
    setDraft(merged);

    const stored = readCoordinateReturnDraft(ctx.wizardProgress);
    if (
      stored &&
      !stored.locationEditedByRenter &&
      !stored.timeEditedByRenter &&
      hasCoordinateReturnChangesFromPickup(stored, returnDefaults)
    ) {
      const fresh = buildDefaultCoordinateReturnDraft(ctx);
      void updateWizardProgress(
        ctx.rentalId,
        ctx.viewerUserId,
        coordinateReturnDraftProgressPatch(fresh)
      );
    }
  }, [
    ctx,
    ctx.rentalId,
    ctx.rental.agreed_pickup_datetime,
    ctx.rental.agreed_return_datetime,
    ctx.rental.meetup_location,
    ctx.rental.return_datetime,
    ctx.rental.return_time,
    ctx.pickupIso,
    ctx.returnIso,
    ctx.scheduleHints.rentalEndDate,
    ctx.scheduleHints.returnIso,
    ctx.viewerUserId,
    ctx.wizardProgress.coordinate_return_draft,
    returnDefaults,
  ]);

  const persistDraft = useCallback(
    (next: WizardMeetupProposalDraft) => {
      setDraft(next);
      void updateWizardProgress(ctx.rentalId, ctx.viewerUserId, coordinateReturnDraftProgressPatch(next));
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
  const returnCoordination = ctx.meetupCoordination.return;
  const waitingOnCounterparty =
    returnCoordination.isPendingThisPhase && returnCoordination.viewerIsProposer;
  const ownerProposalPending =
    returnCoordination.isPendingThisPhase &&
    returnCoordination.proposedByRole === 'owner' &&
    !returnCoordination.viewerIsProposer;
  const returnChanges = useMemo(
    () => hasReturnChanges(displayDraft, ctx, returnDefaults),
    [displayDraft, ctx, returnDefaults]
  );

  const lockedReturnSchedule = useMemo(() => resolveLockedReturnSchedule(ctx), [ctx]);

  const timeSlots = useMemo(
    () =>
      buildCoordinateTimeSlots({
        lockedSchedule: lockedReturnSchedule,
        ownerProposalIso: ctx.returnIso ?? returnDefaults.meetupTimeIso,
        selectedIso: displayDraft.meetupTimeIso,
      }),
    [ctx.returnIso, displayDraft.meetupTimeIso, lockedReturnSchedule, returnDefaults.meetupTimeIso]
  );

  const saveReturnTime = useCallback(
    (iso: string) => {
      patchDraft({
        meetupTimeIso: applyTimeToLockedMeetupDate(lockedReturnSchedule.dateYmd, iso),
        timeEditedByRenter: true,
      });
    },
    [lockedReturnSchedule.dateYmd, patchDraft]
  );

  const canAct =
    isAcceptedPickupCoordinationReady(pickupAccepted) || isCoordinateDraftValid(displayDraft);

  const primaryLabel = ownerProposalPending
    ? 'Return proposal pending'
    : waitingOnCounterparty
      ? 'Waiting for owner'
      : returnChanges
        ? 'Propose changes'
        : 'Confirm return details';

  const footerNote = ownerProposalPending
    ? 'The owner proposed return details. Review and respond in Messages.'
    : waitingOnCounterparty
      ? 'Your return proposal was sent. The owner will review it in Messages.'
      : returnChanges
        ? 'The owner will be notified of your proposed return changes.'
        : undefined;

  const handlePrimary = async () => {
    if (!canAct || waitingOnCounterparty || ownerProposalPending || hasPendingLifecyclePrompt) return;
    const payload = displayDraftFromDefaults(draft, returnDefaults, pickupAccepted);
    if (returnChanges) {
      const ok = await w.submitCoordinateReturnProposal(payload);
      if (ok) await w.refresh();
      return;
    }
    const ok = await w.completeReturnCoordination(payload);
    if (ok) await w.goToResolvedNext();
  };

  return (
    <>
      <WizardLightShell
        title={meta.title}
        subtitle="Return will follow the same arrangement as your confirmed pickup unless you change it below."
        onBack={() => router.back()}
        onOpenMessages={w.openMessages}
        primaryLabel={primaryLabel}
        primaryDisabled={
          waitingOnCounterparty || ownerProposalPending || !canAct || w.proposalBusy || hasPendingLifecyclePrompt
        }
        onPrimary={() => void handlePrimary()}
        secondaryLabel="Open messages"
        onSecondary={w.openMessages}
        footerNote={footerNote}
      >
        <WizardItemCard
          title={ctx.displayTitle}
          ownerLine={formatBorrowingFromOwner(ctx.ownerDisplayName)}
          rentalCode={ctx.rentalCodeLabel}
          thumbUri={ctx.heroImageUrl}
        />
        <WizardCoordinateStep
          phase="return"
          agreedMethod={agreedMethod}
          agreedDeliveryFee={ctx.agreedDeliveryFee}
          method={agreedMethod}
          onMethodChange={() => {}}
          methodReadOnly
          location={displayDraft.location}
          locationCardTitle={returnLocationCardTitle(displayDraft, returnChanges)}
          scheduleFieldTitle={
            returnChanges ? 'Choose a return time' : returnTimeCardTitle(returnChanges)
          }
          meetupDateHint={
            returnChanges && !waitingOnCounterparty && !ownerProposalPending
              ? meetupDateHintForYmd(lockedReturnSchedule.dateYmd)
              : undefined
          }
          onPressLocation={() => setLocationOpen(true)}
          scheduleIso={displayDraft.meetupTimeIso}
          lockFields={waitingOnCounterparty || ownerProposalPending || hasPendingLifecyclePrompt}
          hideTimeChips={!returnChanges}
          waitingForOwner={waitingOnCounterparty}
          waitingBannerText="Your return proposal was sent. The owner will review it in Messages."
          ownerProposalPending={ownerProposalPending}
          ownerProposalBannerText="The owner proposed return details. Accept or suggest changes in Messages."
          timeSlots={timeSlots}
          selectedTimeIso={displayDraft.meetupTimeIso}
          onSelectTimeSlot={saveReturnTime}
          onPressTime={() => setTimeOpen(true)}
        />
      </WizardLightShell>

      <WizardLocationProposalSheet
        visible={locationOpen}
        initialValue={displayDraft.location}
        title="Change return location"
        onClose={() => setLocationOpen(false)}
        onSave={(location) => patchDraft({ location, locationEditedByRenter: true })}
      />

      <WizardTimeProposalSheet
        visible={timeOpen}
        initialIso={displayDraft.meetupTimeIso}
        lockedDateYmd={lockedReturnSchedule.dateYmd}
        title="Choose return time"
        dateHint={meetupDateHintForYmd(lockedReturnSchedule.dateYmd)}
        onClose={() => setTimeOpen(false)}
        onSave={saveReturnTime}
      />
    </>
  );
}
