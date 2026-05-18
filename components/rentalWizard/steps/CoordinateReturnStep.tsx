import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

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
  type WizardMeetupProposalDraft,
} from '@/lib/rentalWizard/wizardMeetupDraft';
import { updateWizardProgress } from '@/lib/rentalWizard';

function displayDraftFromAccepted(
  draft: WizardMeetupProposalDraft,
  accepted: ReturnType<typeof buildAcceptedPickupCoordination>
): WizardMeetupProposalDraft {
  return {
    ...draft,
    location: draft.locationEditedByRenter ? draft.location : draft.location.trim() || accepted.location,
    meetupTimeIso: draft.timeEditedByRenter
      ? draft.meetupTimeIso
      : draft.meetupTimeIso ?? accepted.meetupTimeIso,
    method: accepted.method,
    agreedMethod: accepted.method,
    agreedDeliveryFee: accepted.deliveryFee,
  };
}

export function CoordinateReturnStep() {
  const router = useRouter();
  const w = useRentalWizard();
  const { ctx } = w;
  const meta = WIZARD_STEP_META.coordinate_return;

  const accepted = useMemo(() => buildAcceptedPickupCoordination(ctx), [ctx]);

  const [draft, setDraft] = useState<WizardMeetupProposalDraft>(() =>
    mergeCoordinateReturnDraft(ctx, readCoordinateReturnDraft(ctx.wizardProgress))
  );
  const [locationOpen, setLocationOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);

  const displayDraft = useMemo(
    () => displayDraftFromAccepted(draft, accepted),
    [draft, accepted]
  );

  useEffect(() => {
    const merged = mergeCoordinateReturnDraft(ctx, readCoordinateReturnDraft(ctx.wizardProgress));
    setDraft(merged);

    const stored = readCoordinateReturnDraft(ctx.wizardProgress);
    if (
      stored &&
      !stored.locationEditedByRenter &&
      !stored.timeEditedByRenter &&
      hasCoordinateReturnChangesFromPickup(stored, accepted)
    ) {
      const fresh = buildDefaultCoordinateReturnDraft(ctx);
      void updateWizardProgress(
        ctx.rentalId,
        ctx.viewerUserId,
        coordinateReturnDraftProgressPatch(fresh)
      );
    }
  }, [
    accepted,
    ctx,
    ctx.rentalId,
    ctx.rental.agreed_pickup_datetime,
    ctx.rental.meetup_location,
    ctx.rental.meetup_time,
    ctx.rental.pickup_datetime,
    ctx.pickupIso,
    ctx.viewerUserId,
    ctx.wizardProgress.coordinate_return_draft,
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
  const returnChanges = useMemo(
    () => hasReturnChanges(displayDraft, ctx, accepted),
    [displayDraft, ctx, accepted]
  );

  const waitingForOwner =
    ctx.hasPendingProposal && String(ctx.rental.last_proposed_by ?? '').trim() === ctx.viewerUserId;

  const timeSlots = useMemo(
    () =>
      buildCoordinateTimeSlots({
        ownerProposalIso: accepted.meetupTimeIso,
        rentalStartDate: ctx.scheduleHints.rentalEndDate,
        selectedIso: displayDraft.meetupTimeIso,
      }),
    [accepted.meetupTimeIso, ctx.scheduleHints.rentalEndDate, displayDraft.meetupTimeIso]
  );

  const canAct =
    isAcceptedPickupCoordinationReady(accepted) || isCoordinateDraftValid(displayDraft);

  const primaryLabel = waitingForOwner
    ? 'Waiting for owner'
    : returnChanges
      ? 'Propose changes'
      : 'Confirm return details';

  const footerNote = waitingForOwner
    ? 'Your return changes were sent. The owner will review them in Messages.'
    : returnChanges
      ? 'The owner will be notified of your proposed changes.'
      : undefined;

  const handlePrimary = async () => {
    if (!canAct || waitingForOwner) return;
    const payload = displayDraftFromAccepted(draft, accepted);
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
        primaryDisabled={waitingForOwner || !canAct || w.proposalBusy}
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
          scheduleFieldTitle={returnTimeCardTitle(returnChanges)}
          onPressLocation={() => setLocationOpen(true)}
          scheduleIso={displayDraft.meetupTimeIso}
          lockFields={waitingForOwner}
          hideTimeChips={!returnChanges}
          waitingForOwner={waitingForOwner}
          timeSlots={timeSlots}
          selectedTimeIso={displayDraft.meetupTimeIso}
          onSelectTimeSlot={(iso) =>
            patchDraft({
              meetupTimeIso: iso,
              timeEditedByRenter: true,
            })
          }
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
        onClose={() => setTimeOpen(false)}
        onSave={(iso) => patchDraft({ meetupTimeIso: iso, timeEditedByRenter: true })}
      />
    </>
  );
}
