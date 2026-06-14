import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useOwnerRentalWizard } from '@/components/ownerRentalWizard/OwnerRentalWizardProvider';
import { WizardCoordinateStep } from '@/components/rentalWizard/WizardCoordinateStep';
import { WizardItemCard } from '@/components/rentalWizard/WizardItemCard';
import { WizardCoordinationLiveBannerSlot } from '@/components/rentalWizard/WizardCoordinationLiveBannerSlot';
import { WizardLightShell } from '@/components/rentalWizard/shells/WizardLightShell';
import { WizardLocationProposalSheet } from '@/components/rentalWizard/modals/WizardLocationProposalSheet';
import { WizardTimeProposalSheet } from '@/components/rentalWizard/modals/WizardTimeProposalSheet';
import { useCoordinationProposalFieldHighlight } from '@/components/rentalWizard/hooks/useCoordinationProposalFieldHighlight';
import { useCoordinateProposalReviewUi } from '@/components/rentalWizard/hooks/useCoordinateProposalReviewUi';
import {
  buildAcceptedPickupCoordination,
  isAcceptedPickupCoordinationReady,
} from '@/lib/rentalWizard/acceptedPickupCoordination';
import { buildCoordinateTimeSlots } from '@/lib/rentalWizard/buildCoordinateTimeSlots';
import {
  applyTimeToLockedMeetupDate,
  meetupDateHintForYmd,
  resolveLockedReturnSchedule,
} from '@/lib/rentalWizard/coordinateMeetupSchedule';
import {
  coordinateLocationCardTitle,
  coordinateScheduleFieldTitle,
  counterpartyRoleForViewer,
} from '@/lib/rentalWizard/coordinateProposalPresentation';
import {
  isReturnCoordinationFinalizedForWizard,
  resolvePickupCoordinateReviewState,
} from '@/lib/rentalWizard/coordinatePickupReviewState';
import { OWNER_WIZARD_STEP_META } from '@/lib/ownerRentalWizard/ownerWizardStepMeta';
import {
  buildInheritedReturnDefaults,
  logReturnMeetupDefaults,
} from '@/lib/rentalWizard/resolveReturnMeetupDefaults';
import {
  buildDefaultCoordinateReturnDraft,
  coordinateReturnDraftProgressPatch,
  hasCoordinateReturnChangesFromPickup,
  hasReturnChanges,
  isCoordinateDraftValid,
  mergeCoordinateReturnDraft,
  readCoordinateReturnDraft,
  wizardHandoffFromNegotiation,
  type CoordinateReturnInheritedDefaults,
  type WizardMeetupProposalDraft,
} from '@/lib/rentalWizard/wizardMeetupDraft';
import { updateWizardProgress } from '@/lib/rentalWizard';
import type { WizardFooterInlineAction } from '@/components/wizard/GuidedWizardChrome';

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

export function OwnerCoordinateReturnStep() {
  const router = useRouter();
  const w = useOwnerRentalWizard();
  const { ctx } = w;
  const meta = OWNER_WIZARD_STEP_META.coordinate_return;

  const pickupAccepted = useMemo(() => buildAcceptedPickupCoordination(ctx), [ctx]);
  const returnDefaults = useMemo(() => buildInheritedReturnDefaults(ctx), [ctx]);

  const [draft, setDraft] = useState<WizardMeetupProposalDraft>(() =>
    mergeCoordinateReturnDraft(ctx, readCoordinateReturnDraft(ctx.wizardProgress))
  );
  const [locationOpen, setLocationOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [suggestingChanges, setSuggestingChanges] = useState(false);

  const returnCoordination = ctx.meetupCoordination.return;
  const returnCoordinationFinalized = isReturnCoordinationFinalizedForWizard(returnCoordination);
  const review = resolvePickupCoordinateReviewState({
    lane: returnCoordination,
    lastProposedBy: ctx.rental.last_proposed_by,
    suggestingChanges,
  });
  const {
    reviewingCounterpartyProposal: reviewingRenterProposal,
    waitingOnCounterparty,
    viewerCanAccept,
  } = review;
  const renterProposalPending = viewerCanAccept;

  useEffect(() => {
    if (!renterProposalPending) {
      setSuggestingChanges(false);
    }
  }, [renterProposalPending]);

  const displayDraft = useMemo(
    () => displayDraftFromDefaults(draft, returnDefaults, pickupAccepted),
    [draft, returnDefaults, pickupAccepted]
  );

  useEffect(() => {
    logReturnMeetupDefaults(ctx, 'owner_coordinate_return_mount');
  }, [ctx]);

  useEffect(() => {
    const merged = mergeCoordinateReturnDraft(ctx, readCoordinateReturnDraft(ctx.wizardProgress));
    const counterpartyProposalActive =
      returnCoordination.isPendingThisPhase && returnCoordination.viewerCanAccept;
    const mergedDraft =
      counterpartyProposalActive && !suggestingChanges
        ? {
            ...merged,
            location: review.laneLocation || merged.location,
            meetupTimeIso: review.laneDateTimeIso ?? merged.meetupTimeIso,
          }
        : merged;
    setDraft(mergedDraft);

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
    ctx.rental.last_proposed_by,
    ctx.rental.proposal_version,
    ctx.meetupCoordination.revision,
    ctx.meetupCoordination.return.dateTimeIso,
    ctx.meetupCoordination.return.location,
    ctx.meetupCoordination.return.status,
    ctx.meetupCoordination.return.proposedByRole,
    ctx.meetupCoordination.return.isPendingThisPhase,
    ctx.meetupCoordination.return.viewerCanAccept,
    ctx.pickupIso,
    ctx.returnIso,
    ctx.scheduleHints.rentalEndDate,
    ctx.scheduleHints.returnIso,
    ctx.viewerUserId,
    ctx.wizardProgress.coordinate_return_draft,
    returnDefaults,
    review.laneDateTimeIso,
    review.laneLocation,
    reviewingRenterProposal,
    suggestingChanges,
    returnCoordination.isPendingThisPhase,
    returnCoordination.viewerCanAccept,
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
    () => hasReturnChanges(displayDraft, ctx, returnDefaults),
    [displayDraft, ctx, returnDefaults]
  );

  const lockedReturnSchedule = useMemo(() => resolveLockedReturnSchedule(ctx), [ctx]);

  const proposedLocation =
    review.laneLocation || returnCoordination.location || displayDraft.location;
  const proposedScheduleIso =
    review.laneDateTimeIso ??
    returnCoordination.dateTimeIso ??
    ctx.returnIso ??
    displayDraft.meetupTimeIso;

  const timeSlots = useMemo(
    () =>
      buildCoordinateTimeSlots({
        lockedSchedule: lockedReturnSchedule,
        ownerProposalIso: proposedScheduleIso,
        selectedIso: displayDraft.meetupTimeIso,
      }),
    [displayDraft.meetupTimeIso, lockedReturnSchedule, proposedScheduleIso]
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

  const displayLocation = reviewingRenterProposal ? proposedLocation : displayDraft.location;
  const scheduleIso = reviewingRenterProposal
    ? proposedScheduleIso
    : returnCoordinationFinalized
      ? ctx.returnIso
      : displayDraft.meetupTimeIso;

  const canAct =
    isAcceptedPickupCoordinationReady(pickupAccepted) || isCoordinateDraftValid(displayDraft);

  const reviewUi = useCoordinateProposalReviewUi();

  const fieldHighlights = useCoordinationProposalFieldHighlight({
    phase: 'return',
    reviewingCounterpartyProposal: reviewingRenterProposal,
    coordinationFinalized: returnCoordinationFinalized,
    lane: returnCoordination,
    ctx,
    logSurface: 'owner_coordinate_return_review',
    proposalVersion:
      typeof ctx.rental.proposal_version === 'number' ? ctx.rental.proposal_version : null,
  });

  const fieldsLocked =
    returnCoordinationFinalized ||
    waitingOnCounterparty ||
    reviewingRenterProposal;

  const counterpartyRole = counterpartyRoleForViewer(ctx);
  const locationTitle = coordinateLocationCardTitle({
    phase: 'return',
    coordinationFinalized: returnCoordinationFinalized,
    reviewingCounterpartyProposal: reviewingRenterProposal,
    counterpartyRole,
    waitingOnCounterparty,
  });
  const scheduleTitle = coordinateScheduleFieldTitle({
    phase: 'return',
    coordinationFinalized: returnCoordinationFinalized,
    reviewingCounterpartyProposal: reviewingRenterProposal,
    counterpartyRole,
    waitingOnCounterparty,
    editing: !fieldsLocked && !reviewingRenterProposal && !waitingOnCounterparty && returnChanges,
  });

  const handleAccept = useCallback(async () => {
    if (!reviewingRenterProposal || w.proposalBusy) return;
    reviewUi.dismissBanner();
    const ok = await w.acceptReturnProposal();
    if (ok) await w.refresh();
  }, [reviewingRenterProposal, reviewUi, w]);

  const handlePrimary = useCallback(async () => {
    if (!canAct || waitingOnCounterparty || reviewingRenterProposal || w.proposalBusy) return;
    const payload = displayDraftFromDefaults(draft, returnDefaults, pickupAccepted);
    if (returnChanges || suggestingChanges) {
      const ok = await w.submitCoordinateReturnProposal(payload);
      if (ok) {
        setSuggestingChanges(false);
        await w.refresh();
      }
      return;
    }
    const ok = await w.completeReturnCoordination(payload);
    if (ok) await w.refresh();
  }, [
    canAct,
    draft,
    ctx.rentalId,
    ctx.viewerUserId,
    pickupAccepted,
    returnChanges,
    returnDefaults,
    reviewingRenterProposal,
    suggestingChanges,
    waitingOnCounterparty,
    w,
  ]);

  const footer = useMemo((): {
    primaryLabel: string;
    primaryDisabled: boolean;
    onPrimary: () => void;
    inlineActions?: WizardFooterInlineAction[];
    footerNote?: string;
  } => {
    const openMessagesAction: WizardFooterInlineAction = {
      label: 'Open messages',
      onPress: w.openMessages,
      emphasis: 'tertiary',
    };

    if (returnCoordinationFinalized) {
      return {
        primaryLabel: 'Continue',
        primaryDisabled: false,
        onPrimary: () => void w.goToResolvedNext(),
        inlineActions: [openMessagesAction],
      };
    }
    if (reviewingRenterProposal) {
      return {
        primaryLabel: w.proposalBusy ? 'Accepting…' : 'Accept proposal',
        primaryDisabled: w.proposalBusy,
        onPrimary: () => void handleAccept(),
        inlineActions: [
          {
            label: 'Suggest changes',
            onPress: () => {
              reviewUi.dismissBanner();
              setSuggestingChanges(true);
            },
            emphasis: 'secondary',
            disabled: w.proposalBusy,
          },
          openMessagesAction,
        ],
      };
    }
    if (suggestingChanges && renterProposalPending) {
      return {
        primaryLabel: w.proposalBusy ? 'Sending…' : 'Propose return details',
        primaryDisabled: !canAct || w.proposalBusy,
        onPrimary: () => void handlePrimary(),
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
        primaryLabel: 'Waiting for renter',
        primaryDisabled: true,
        onPrimary: () => {},
        inlineActions: [openMessagesAction],
        footerNote: 'Your return proposal was sent. The renter will review it here.',
      };
    }
    return {
      primaryLabel: returnChanges
        ? w.proposalBusy
          ? 'Sending…'
          : 'Propose return details'
        : w.proposalBusy
          ? 'Saving…'
          : 'Confirm return details',
      primaryDisabled: !canAct || w.proposalBusy,
      onPrimary: () => void handlePrimary(),
      inlineActions: [openMessagesAction],
      footerNote: returnChanges
        ? 'The renter will be notified of your proposed return details.'
        : 'The renter will be asked to confirm these return details.',
    };
  }, [
    canAct,
    returnCoordinationFinalized,
    handleAccept,
    handlePrimary,
    renterProposalPending,
    returnChanges,
    reviewUi,
    reviewingRenterProposal,
    suggestingChanges,
    waitingOnCounterparty,
    w,
  ]);

  return (
    <>
      <WizardLightShell
        title={meta.title}
        subtitle="Confirm where and when the renter will return your item."
        onBack={() => router.back()}
        onOpenMessages={w.openMessages}
        primaryLabel={footer.primaryLabel}
        primaryDisabled={footer.primaryDisabled}
        onPrimary={footer.onPrimary}
        footerInlineActions={footer.inlineActions}
        footerNote={footer.footerNote}
        footerCompact
        headerExtra={
          <WizardCoordinationLiveBannerSlot lane="return" rentalId={ctx.rentalId} />
        }
      >
        <WizardItemCard
          title={ctx.displayTitle}
          ownerLine={`Rented by ${ctx.counterpartyDisplayName}`}
          rentalCode={ctx.rentalCodeLabel}
          thumbUri={ctx.heroImageUrl}
        />
        <WizardCoordinateStep
          phase="return"
          copyVariant="owner"
          agreedMethod={agreedMethod}
          agreedDeliveryFee={ctx.agreedDeliveryFee}
          method={agreedMethod}
          onMethodChange={() => {}}
          methodReadOnly
          location={displayLocation}
          locationCardTitle={locationTitle}
          scheduleFieldTitle={scheduleTitle}
          meetupDateHint={
            (returnChanges || suggestingChanges) &&
            !waitingOnCounterparty &&
            !reviewingRenterProposal
              ? meetupDateHintForYmd(lockedReturnSchedule.dateYmd)
              : undefined
          }
          onPressLocation={() => setLocationOpen(true)}
          scheduleIso={scheduleIso}
          lockFields={fieldsLocked}
          coordinationFinalized={returnCoordinationFinalized}
          reviewingCounterpartyProposal={reviewingRenterProposal}
          highlightLocation={fieldHighlights.highlightLocation}
          highlightTime={fieldHighlights.highlightTime}
          hideTimeChips={!returnChanges && !suggestingChanges && !reviewingRenterProposal}
          waitingForOwner={waitingOnCounterparty}
          waitingBannerText="Your return proposal was sent. The renter will review it here."
          ownerProposalPending={false}
          timeSlots={timeSlots}
          selectedTimeIso={reviewingRenterProposal ? scheduleIso : displayDraft.meetupTimeIso}
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
