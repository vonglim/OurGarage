import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';

import { useReturnCoordinationAcceptedPromptSnapshotTrace } from '@/components/rentalWizard/hooks/useReturnCoordinationAcceptedPrompt';
import { useCoordinationProposalFieldHighlight } from '@/components/rentalWizard/hooks/useCoordinationProposalFieldHighlight';
import { useCoordinateProposalReviewUi } from '@/components/rentalWizard/hooks/useCoordinateProposalReviewUi';
import { useRentalWizard } from '@/components/rentalWizard/RentalWizardProvider';
import { WizardCoordinateStep } from '@/components/rentalWizard/WizardCoordinateStep';
import { WizardCoordinationLiveBannerSlot } from '@/components/rentalWizard/WizardCoordinationLiveBannerSlot';
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
import {
  coordinateLocationCardTitle,
  coordinateScheduleFieldTitle,
  counterpartyRoleForViewer,
} from '@/lib/rentalWizard/coordinateProposalPresentation';
import {
  isReturnCoordinationFinalizedForWizard,
  resolvePickupCoordinateReviewState,
} from '@/lib/rentalWizard/coordinatePickupReviewState';
import { WIZARD_STEP_META } from '@/lib/rentalWizard/wizardStepMeta';
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
import { acceptRentalMeetupProposal } from '@/lib/rentalMeetupProposalLifecycle';
import { getSupabase } from '@/lib/supabase';
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
  const [suggestingChanges, setSuggestingChanges] = useState(false);
  const [acceptBusy, setAcceptBusy] = useState(false);

  const returnCoordination = ctx.meetupCoordination.return;
  const returnCoordinationFinalized = isReturnCoordinationFinalizedForWizard(returnCoordination);
  const review = resolvePickupCoordinateReviewState({
    lane: returnCoordination,
    lastProposedBy: ctx.rental.last_proposed_by,
    suggestingChanges,
  });

  const {
    reviewingCounterpartyProposal: reviewingOwnerProposal,
    waitingOnCounterparty,
    viewerCanAccept,
  } = review;

  useEffect(() => {
    if (!viewerCanAccept) {
      setSuggestingChanges(false);
    }
  }, [viewerCanAccept]);

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
    ctx.rental.last_proposed_by,
    ctx.rental.proposal_version,
    ctx.rental.return_datetime,
    ctx.rental.return_time,
    ctx.meetupCoordination.revision,
    ctx.meetupCoordination.return.dateTimeIso,
    ctx.meetupCoordination.return.isPendingThisPhase,
    ctx.meetupCoordination.return.location,
    ctx.meetupCoordination.return.proposedByRole,
    ctx.meetupCoordination.return.status,
    ctx.meetupCoordination.return.viewerCanAccept,
    ctx.meetupCoordination.return.viewerIsProposer,
    ctx.pickupIso,
    ctx.returnIso,
    ctx.scheduleHints.rentalEndDate,
    ctx.scheduleHints.returnIso,
    ctx.viewerUserId,
    ctx.wizardProgress.coordinate_return_draft,
    returnCoordination.isPendingThisPhase,
    returnCoordination.viewerCanAccept,
    returnDefaults,
    review.laneDateTimeIso,
    review.laneLocation,
    reviewingOwnerProposal,
    suggestingChanges,
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

  const displayLocation = reviewingOwnerProposal ? proposedLocation : displayDraft.location;
  const scheduleIso = reviewingOwnerProposal
    ? proposedScheduleIso
    : returnCoordinationFinalized
      ? ctx.returnIso
      : displayDraft.meetupTimeIso;

  const canAct =
    isAcceptedPickupCoordinationReady(pickupAccepted) || isCoordinateDraftValid(displayDraft);

  const reviewUi = useCoordinateProposalReviewUi();

  const fieldHighlights = useCoordinationProposalFieldHighlight({
    phase: 'return',
    reviewingCounterpartyProposal: reviewingOwnerProposal,
    coordinationFinalized: returnCoordinationFinalized,
    lane: returnCoordination,
    ctx,
    logSurface: 'renter_coordinate_return_review',
    proposalVersion:
      typeof ctx.rental.proposal_version === 'number' ? ctx.rental.proposal_version : null,
  });

  const fieldsLocked =
    returnCoordinationFinalized ||
    waitingOnCounterparty ||
    reviewingOwnerProposal ||
    hasPendingLifecyclePrompt;

  const counterpartyRole = counterpartyRoleForViewer(ctx);
  const locationTitle = coordinateLocationCardTitle({
    phase: 'return',
    coordinationFinalized: returnCoordinationFinalized,
    reviewingCounterpartyProposal: reviewingOwnerProposal,
    counterpartyRole,
    waitingOnCounterparty,
  });
  const scheduleTitle = coordinateScheduleFieldTitle({
    phase: 'return',
    coordinationFinalized: returnCoordinationFinalized,
    reviewingCounterpartyProposal: reviewingOwnerProposal,
    counterpartyRole,
    waitingOnCounterparty,
    editing: !fieldsLocked && returnChanges,
  });

  const canPropose = isCoordinateDraftValid(displayDraft);

  const handleAccept = async () => {
    if (!reviewingOwnerProposal || hasPendingLifecyclePrompt || acceptBusy || w.proposalBusy) return;
    reviewUi.dismissBanner();
    setAcceptBusy(true);
    try {
      const result = await acceptRentalMeetupProposal(getSupabase(), ctx.rental, ctx.viewerUserId, {
        itemTitle: ctx.displayTitle,
      });
      if (!result.ok) {
        Alert.alert('Could not accept return details', result.message ?? 'Please try again.');
        return;
      }
      await w.refresh();
      w.goToWizardStep('transition_return_confirmed');
    } finally {
      setAcceptBusy(false);
    }
  };

  const handleCounterPropose = async () => {
    if (!canPropose || hasPendingLifecyclePrompt || w.proposalBusy) return;
    const payload = displayDraftFromDefaults(draft, returnDefaults, pickupAccepted);
    const ok = await w.submitCoordinateReturnProposal(payload);
    if (ok) {
      setSuggestingChanges(false);
      await w.refresh();
    }
  };

  const handlePrimary = async () => {
    if (!canAct || waitingOnCounterparty || reviewingOwnerProposal || hasPendingLifecyclePrompt) return;
    const payload = displayDraftFromDefaults(draft, returnDefaults, pickupAccepted);
    if (returnChanges) {
      const ok = await w.submitCoordinateReturnProposal(payload);
      if (ok) await w.refresh();
      return;
    }
    const ok = await w.completeReturnCoordination(payload);
    if (ok) await w.refresh();
  };

  const footer = ((): {
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

    if (reviewingOwnerProposal) {
      return {
        primaryLabel: acceptBusy || w.proposalBusy ? 'Accepting…' : 'Accept proposal',
        primaryDisabled: hasPendingLifecyclePrompt || acceptBusy || w.proposalBusy,
        onPrimary: () => void handleAccept(),
        inlineActions: [
          {
            label: 'Suggest changes',
            onPress: () => {
              reviewUi.dismissBanner();
              setSuggestingChanges(true);
            },
            emphasis: 'secondary',
            disabled: acceptBusy || w.proposalBusy,
          },
          openMessagesAction,
        ],
      };
    }
    if (suggestingChanges && viewerCanAccept) {
      return {
        primaryLabel: w.proposalBusy ? 'Sending…' : 'Send counter-proposal',
        primaryDisabled: hasPendingLifecyclePrompt || !canPropose || w.proposalBusy,
        onPrimary: () => void handleCounterPropose(),
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
        footerNote: 'Your return proposal was sent. The owner will review it here.',
      };
    }
    return {
      primaryLabel: returnChanges ? 'Propose changes' : 'Confirm return details',
      primaryDisabled:
        !canAct || w.proposalBusy || hasPendingLifecyclePrompt,
      onPrimary: () => void handlePrimary(),
      inlineActions: [openMessagesAction],
        footerNote: returnChanges
          ? 'The owner will be notified of your proposed return changes.'
          : 'The owner will be asked to confirm these return details.',
    };
  })();

  return (
    <>
      <WizardLightShell
        title={meta.title}
        subtitle="Return will follow the same arrangement as your confirmed pickup unless you change it below."
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
          location={displayLocation}
          locationCardTitle={locationTitle}
          scheduleFieldTitle={scheduleTitle}
          meetupDateHint={
            (returnChanges || suggestingChanges) && !waitingOnCounterparty && !reviewingOwnerProposal
              ? meetupDateHintForYmd(lockedReturnSchedule.dateYmd)
              : undefined
          }
          onPressLocation={() => setLocationOpen(true)}
          scheduleIso={scheduleIso}
          lockFields={fieldsLocked}
          coordinationFinalized={returnCoordinationFinalized}
          reviewingCounterpartyProposal={reviewingOwnerProposal}
          highlightLocation={fieldHighlights.highlightLocation}
          highlightTime={fieldHighlights.highlightTime}
          hideTimeChips={!returnChanges && !suggestingChanges && !reviewingOwnerProposal}
          waitingForOwner={waitingOnCounterparty}
          waitingBannerText="Your return proposal was sent. The owner will review it here."
          ownerProposalPending={false}
          timeSlots={timeSlots}
          selectedTimeIso={reviewingOwnerProposal ? scheduleIso : displayDraft.meetupTimeIso}
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
