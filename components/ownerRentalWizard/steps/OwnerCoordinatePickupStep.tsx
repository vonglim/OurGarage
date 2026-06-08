import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';

import { useOwnerRentalWizard } from '@/components/ownerRentalWizard/OwnerRentalWizardProvider';
import { WizardCoordinateStep } from '@/components/rentalWizard/WizardCoordinateStep';
import { WizardItemCard } from '@/components/rentalWizard/WizardItemCard';
import { WizardCoordinationLiveBannerSlot } from '@/components/rentalWizard/WizardCoordinationLiveBannerSlot';
import { WizardLightShell } from '@/components/rentalWizard/shells/WizardLightShell';
import { WizardLocationProposalSheet } from '@/components/rentalWizard/modals/WizardLocationProposalSheet';
import { WizardTimeProposalSheet } from '@/components/rentalWizard/modals/WizardTimeProposalSheet';
import { buildCoordinateTimeSlots } from '@/lib/rentalWizard/buildCoordinateTimeSlots';
import {
  applyTimeToLockedMeetupDate,
  meetupDateHintForYmd,
  resolveLockedPickupSchedule,
} from '@/lib/rentalWizard/coordinateMeetupSchedule';
import {
  coordinateLocationCardTitle,
  coordinateScheduleFieldTitle,
  counterpartyRoleForViewer,
} from '@/lib/rentalWizard/coordinateProposalPresentation';
import { useCoordinationProposalFieldHighlight } from '@/components/rentalWizard/hooks/useCoordinationProposalFieldHighlight';
import { useCoordinateProposalReviewUi } from '@/components/rentalWizard/hooks/useCoordinateProposalReviewUi';
import {
  logCoordinationReviewState,
  resolvePickupCoordinateReviewState,
} from '@/lib/rentalWizard/coordinatePickupReviewState';
import {
  coordinatePickupDraftProgressPatch,
  isCoordinateDraftValid,
  mergeCoordinatePickupDraft,
  readCoordinatePickupDraft,
  wizardHandoffFromNegotiation,
  type WizardMeetupProposalDraft,
} from '@/lib/rentalWizard/wizardMeetupDraft';
import { updateWizardProgress } from '@/lib/rentalWizard';
import type { WizardFooterInlineAction } from '@/components/wizard/GuidedWizardChrome';

import { OWNER_WIZARD_STEP_META } from '@/lib/ownerRentalWizard/ownerWizardStepMeta';

const WIZARD_MESSAGES_HELP =
  'Use Messages to discuss pickup location, timing, or return details with the renter.';

export function OwnerCoordinatePickupStep() {
  const router = useRouter();
  const w = useOwnerRentalWizard();
  const { ctx } = w;
  const meta = OWNER_WIZARD_STEP_META.coordinate_pickup;

  const [draft, setDraft] = useState<WizardMeetupProposalDraft>(() =>
    mergeCoordinatePickupDraft(ctx, readCoordinatePickupDraft(ctx.wizardProgress))
  );
  const [locationOpen, setLocationOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [suggestingChanges, setSuggestingChanges] = useState(false);

  const pickupCoordination = ctx.meetupCoordination.pickup;
  const review = resolvePickupCoordinateReviewState({
    lane: pickupCoordination,
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
    const stored = readCoordinatePickupDraft(ctx.wizardProgress);
    const nextDraft = mergeCoordinatePickupDraft(ctx, stored);
    const mergedDraft =
      reviewingRenterProposal
        ? {
            ...nextDraft,
            location: review.laneLocation || nextDraft.location,
            meetupTimeIso: review.laneDateTimeIso ?? nextDraft.meetupTimeIso,
          }
        : nextDraft;

    setDraft(mergedDraft);
  }, [
    ctx,
    ctx.rentalId,
    ctx.wizardProgress.coordinate_pickup_draft,
    ctx.rental.meetup_location,
    ctx.rental.meetup_time,
    ctx.rental.pickup_datetime,
    ctx.rental.return_datetime,
    ctx.rental.last_proposed_by,
    ctx.rental.proposal_version,
    ctx.meetupCoordination.revision,
    ctx.meetupCoordination.pickup.dateTimeIso,
    ctx.meetupCoordination.pickup.location,
    ctx.meetupCoordination.pickup.status,
    ctx.meetupCoordination.pickup.proposedByRole,
    ctx.meetupCoordination.pickup.isPendingThisPhase,
    ctx.meetupCoordination.pickup.viewerIsProposer,
    ctx.meetupCoordination.pickup.viewerCanAccept,
    review.laneDateTimeIso,
    review.laneLocation,
    reviewingRenterProposal,
    suggestingChanges,
  ]);

  useEffect(() => {
    if (!renterProposalPending) {
      setSuggestingChanges(false);
    }
  }, [renterProposalPending]);

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

  const proposedLocation = review.laneLocation || pickupCoordination.location || draft.location;
  const proposedScheduleIso =
    review.laneDateTimeIso ?? pickupCoordination.dateTimeIso ?? ctx.pickupIso ?? draft.meetupTimeIso;

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

  const displayLocation = reviewingRenterProposal ? proposedLocation : draft.location;
  const scheduleIso = ctx.pickupCoordinationComplete
    ? ctx.pickupIso
    : reviewingRenterProposal
      ? proposedScheduleIso
      : draft.meetupTimeIso;
  const canPropose =
    isCoordinateDraftValid(draft) &&
    !waitingOnCounterparty &&
    !ctx.pickupCoordinationComplete &&
    !reviewingRenterProposal;

  const reviewUi = useCoordinateProposalReviewUi();

  const handlePropose = useCallback(async () => {
    if (!canPropose) return;
    const ok = await w.submitCoordinatePickupProposal(draft);
    if (ok) {
      setSuggestingChanges(false);
      await w.refresh();
    }
  }, [canPropose, draft, w]);

  const handleAccept = useCallback(async () => {
    if (!reviewingRenterProposal || w.proposalBusy) return;
    reviewUi.dismissBanner();
    const ok = await w.acceptPickupProposal();
    if (ok) await w.refresh();
  }, [reviewingRenterProposal, reviewUi, w]);

  const fieldHighlights = useCoordinationProposalFieldHighlight({
    phase: 'pickup',
    reviewingCounterpartyProposal: reviewingRenterProposal,
    coordinationFinalized: ctx.pickupCoordinationComplete,
    lane: pickupCoordination,
    ctx,
    logSurface: 'owner_coordinate_pickup_review',
    proposalVersion:
      typeof ctx.rental.proposal_version === 'number' ? ctx.rental.proposal_version : null,
  });

  const fieldsLocked =
    ctx.pickupCoordinationComplete ||
    waitingOnCounterparty ||
    reviewingRenterProposal;

  const counterpartyRole = counterpartyRoleForViewer(ctx);
  const locationTitle = coordinateLocationCardTitle({
    phase: 'pickup',
    coordinationFinalized: ctx.pickupCoordinationComplete,
    reviewingCounterpartyProposal: reviewingRenterProposal,
    counterpartyRole,
    waitingOnCounterparty,
  });
  const scheduleTitle = coordinateScheduleFieldTitle({
    phase: 'pickup',
    coordinationFinalized: ctx.pickupCoordinationComplete,
    reviewingCounterpartyProposal: reviewingRenterProposal,
    counterpartyRole,
    waitingOnCounterparty,
    editing: !fieldsLocked && !reviewingRenterProposal && !waitingOnCounterparty,
  });

  const footer = useMemo((): {
    primaryLabel: string;
    primaryDisabled: boolean;
    onPrimary: () => void;
    inlineActions?: WizardFooterInlineAction[];
    ctaState: string;
  } => {
    const openMessagesAction: WizardFooterInlineAction = {
      label: 'Open messages',
      onPress: w.openMessages,
      emphasis: 'tertiary',
    };

    if (ctx.pickupCoordinationComplete) {
      return {
        primaryLabel: 'Continue',
        primaryDisabled: false,
        onPrimary: () => void w.goToResolvedNext(),
        inlineActions: [openMessagesAction],
        ctaState: 'continue',
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
        ctaState: 'accept_proposal',
      };
    }
    if (suggestingChanges && renterProposalPending) {
      return {
        primaryLabel: w.proposalBusy ? 'Sending…' : 'Propose pickup details',
        primaryDisabled: !canPropose || w.proposalBusy,
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
        ctaState: 'suggest_changes',
      };
    }
    if (waitingOnCounterparty) {
      return {
        primaryLabel: 'Waiting for renter',
        primaryDisabled: true,
        onPrimary: () => {},
        inlineActions: [openMessagesAction],
        ctaState: 'waiting_for_renter',
      };
    }
    return {
      primaryLabel: w.proposalBusy ? 'Sending…' : 'Propose pickup details',
      primaryDisabled: !canPropose || w.proposalBusy,
      onPrimary: () => void handlePropose(),
      inlineActions: [openMessagesAction],
      ctaState: 'propose',
    };
  }, [
    canPropose,
    ctx.pickupCoordinationComplete,
    handleAccept,
    handlePropose,
    renterProposalPending,
    reviewUi,
    reviewingRenterProposal,
    suggestingChanges,
    waitingOnCounterparty,
    w,
  ]);

  useLayoutEffect(() => {
    logCoordinationReviewState('owner_coordinate_pickup', ctx.rentalId, {
      review,
      suggestingChanges,
      proposalVersion:
        typeof ctx.rental.proposal_version === 'number' ? ctx.rental.proposal_version : null,
      displayedLocation: displayLocation,
      displayedTimeIso: scheduleIso,
      currentCTAState: footer.ctaState,
      reviewingRenterProposal,
    });
  });

  return (
    <>
      <WizardLightShell
        title={meta.title}
        subtitle="Confirm where and when you'll meet the renter to hand off the item."
        onBack={() => router.back()}
        onOpenMessages={w.openMessages}
        primaryLabel={footer.primaryLabel}
        primaryDisabled={footer.primaryDisabled}
        onPrimary={footer.onPrimary}
        footerInlineActions={footer.inlineActions}
        footerCompact
        headerExtra={
          <WizardCoordinationLiveBannerSlot lane="pickup" rentalId={ctx.rentalId} />
        }
      >
        <WizardItemCard
          title={ctx.displayTitle}
          ownerLine={`Rented by ${ctx.counterpartyDisplayName}`}
          rentalCode={ctx.rentalCodeLabel}
          thumbUri={ctx.heroImageUrl}
        />
        <WizardCoordinateStep
          phase="pickup"
          copyVariant="owner"
          agreedMethod={agreedMethod}
          agreedDeliveryFee={ctx.agreedDeliveryFee}
          method={draft.method}
          onMethodChange={(method) => patchDraft({ method })}
          location={displayLocation}
          locationCardTitle={locationTitle}
          scheduleFieldTitle={scheduleTitle}
          onPressLocation={() => setLocationOpen(true)}
          scheduleIso={scheduleIso}
          lockFields={fieldsLocked}
          coordinationFinalized={ctx.pickupCoordinationComplete}
          reviewingCounterpartyProposal={reviewingRenterProposal}
          highlightLocation={fieldHighlights.highlightLocation}
          highlightTime={fieldHighlights.highlightTime}
          waitingForOwner={waitingOnCounterparty}
          waitingBannerText="Your pickup proposal was sent. The renter will review it here."
          ownerProposalPending={false}
          messagesHelpText={
            reviewingRenterProposal || suggestingChanges || waitingOnCounterparty
              ? WIZARD_MESSAGES_HELP
              : undefined
          }
          meetupDateHint={
            !ctx.pickupCoordinationComplete && !waitingOnCounterparty && !reviewingRenterProposal
              ? meetupDateHintForYmd(lockedPickupSchedule.dateYmd)
              : undefined
          }
          timeSlots={timeSlots}
          selectedTimeIso={reviewingRenterProposal ? scheduleIso : draft.meetupTimeIso}
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
        title="Choose pickup time"
        dateHint={meetupDateHintForYmd(lockedPickupSchedule.dateYmd)}
        onClose={() => setTimeOpen(false)}
        onSave={saveMeetupTime}
      />
    </>
  );
}
