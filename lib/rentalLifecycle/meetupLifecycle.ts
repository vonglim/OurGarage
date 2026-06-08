import {
  resolveAuthorizationProgress,
  resolveAuthorizationProgressFromParts,
} from '@/lib/rentalAuthorization/authorizationProgress';
import { bothPartiesAtMeetup } from '@/lib/rentalAuthorization/resolveAuthorizationWizardStep';
import {
  buildPickupHandoffCompletionInputFromWizard,
  resolvePickupHandoffCompletionState,
} from '@/lib/pickupHandoffCompletion';
import { resolveRentalActivationState } from '@/lib/rentalActivation';
import type { RentalWizardContext, RentalWizardProgress } from '@/lib/rentalWizard/types';
import type { PickupHandoffCompletionInput } from '@/lib/pickupHandoffCompletion';

import {
  MEETUP_LIFECYCLE_THEME,
  type MeetupLifecyclePhaseKey,
} from '@/lib/rentalLifecycle/meetupLifecycleTheme';

export type MeetupLifecyclePhase = MeetupLifecyclePhaseKey;

export type MeetupLifecycleProgressIndex = 0 | 1 | 2;

export type OwnerMeetupSubstate =
  | 'awaiting_renter_arrival'
  | 'renter_inspecting'
  | 'inspection_complete'
  | 'renter_reviewing_agreement'
  | 'renter_authorizing_hold'
  | 'renter_signing'
  | 'renter_activating'
  | 'rental_active';

export type MeetupLifecyclePresentation = {
  phase: MeetupLifecyclePhase;
  phaseNumber: number;
  progressIndex: MeetupLifecycleProgressIndex;
  theme: (typeof MEETUP_LIFECYCLE_THEME)[MeetupLifecyclePhase];
  inspectionComplete: boolean;
  authorizationComplete: boolean;
  rentalActivated: boolean;
  bothAtMeetup: boolean;
  renterAtMeetup: boolean;
  ownerAtMeetup: boolean;
  ownerSubstate: OwnerMeetupSubstate;
  renterHeadline: string;
  renterSupport: string;
  ownerHeadline: string;
  ownerSupport: string;
  ownerProgressItems: { id: string; label: string; status: 'done' | 'active' | 'pending' }[];
};

function parseTs(v: string | null | undefined): boolean {
  return Boolean(v?.trim() && Number.isFinite(Date.parse(v.trim())));
}

export function resolveMeetupLifecyclePhase(ctx: RentalWizardContext): MeetupLifecyclePhase {
  const handoffInput = buildPickupHandoffCompletionInputFromWizard(ctx);
  const activation = resolveRentalActivationState(handoffInput);
  const completion = activation.physical;
  const auth = resolveAuthorizationProgress(ctx);

  if (activation.rentalActivated) return 'rental_active';

  const inspectionDone =
    completion.renterConfirmedReceipt ||
    parseTs(ctx.rental.physical_possession_confirmed_at) ||
    completion.physicalPossessionConfirmed;

  if (!inspectionDone) return 'equipment_inspection';

  if (!auth.preMeetupLegalComplete || !auth.securityHoldAuthorized || !auth.digitalSignatureComplete) {
    return 'rental_authorization';
  }

  if (!activation.rentalActivated) return 'rental_authorization';

  return 'rental_active';
}

export function resolveOwnerMeetupSubstate(ctx: RentalWizardContext): OwnerMeetupSubstate {
  const handoffInput = buildPickupHandoffCompletionInputFromWizard(ctx);
  const activation = resolveRentalActivationState(handoffInput);
  const completion = resolvePickupHandoffCompletionState(handoffInput);
  const auth = resolveAuthorizationProgress(ctx);
  const both = bothPartiesAtMeetup(ctx);

  if (activation.rentalActivated) return 'rental_active';

  const inspectionDone = completion.renterConfirmedReceipt;

  if (!both) {
    if (completion.renterArrived) return 'renter_inspecting';
    return 'awaiting_renter_arrival';
  }

  if (!inspectionDone) return 'renter_inspecting';

  if (inspectionDone && !auth.rentalAgreementReviewed) return 'inspection_complete';

  if (!auth.rentalAgreementReviewed) return 'renter_reviewing_agreement';
  if (!auth.securityHoldAuthorized) return 'renter_authorizing_hold';
  if (!auth.digitalSignatureComplete) return 'renter_signing';
  if (!activation.rentalActivated) return 'renter_activating';

  return 'rental_active';
}

/** Owner workspace — same presentation model as renter wizard without full wizard context. */
export function resolveMeetupLifecyclePresentationFromWorkspace(input: {
  handoffInput: PickupHandoffCompletionInput;
  wizardProgress: Pick<RentalWizardProgress, 'renter_pickup_im_here_at' | 'rental_agreement_acknowledged_at'>;
  rental: RentalWizardContext['rental'];
}): MeetupLifecyclePresentation {
  const handoffInput = input.handoffInput;
  const activation = resolveRentalActivationState(handoffInput);
  const completion = resolvePickupHandoffCompletionState(handoffInput);
  const auth = resolveAuthorizationProgressFromWorkspace(handoffInput, input.wizardProgress, input.rental);
  const both = Boolean(
    (input.wizardProgress.renter_pickup_im_here_at?.trim() ||
      input.rental.renter_arrived_at?.trim()) &&
      input.rental.owner_arrived_at?.trim()
  );

  const phase = resolveMeetupLifecyclePhaseFromParts(activation, completion, auth);
  return buildMeetupLifecyclePresentation({
    phase,
    activation,
    completion,
    auth,
    both,
    renterAtMeetup: Boolean(
      input.wizardProgress.renter_pickup_im_here_at?.trim() || input.rental.renter_arrived_at?.trim()
    ),
    ownerAtMeetup: Boolean(input.rental.owner_arrived_at?.trim()),
    viewerRole: 'owner',
    ownerSubstate: resolveOwnerMeetupSubstateFromParts(activation, completion, auth, both),
  });
}

function resolveAuthorizationProgressFromWorkspace(
  handoffInput: PickupHandoffCompletionInput,
  wizardProgress: Pick<RentalWizardProgress, 'rental_agreement_acknowledged_at'>,
  rental: RentalWizardContext['rental']
) {
  const activation = resolveRentalActivationState(handoffInput);
  return resolveAuthorizationProgressFromParts({
    rental,
    wizard: wizardProgress,
    physicalPossessionConfirmed: activation.physical.physicalPossessionConfirmed,
    rentalActivated: activation.rentalActivated,
    pickupInspectionComplete: activation.physical.pickupInspectionComplete,
  });
}

function resolveMeetupLifecyclePhaseFromParts(
  activation: ReturnType<typeof resolveRentalActivationState>,
  completion: ReturnType<typeof resolvePickupHandoffCompletionState>,
  auth: ReturnType<typeof resolveAuthorizationProgressFromParts>
): MeetupLifecyclePhase {
  if (activation.rentalActivated) return 'rental_active';
  const inspectionDone = completion.renterConfirmedReceipt;
  if (!inspectionDone) return 'equipment_inspection';
  if (!auth.preMeetupLegalComplete || !auth.securityHoldAuthorized || !auth.digitalSignatureComplete) {
    return 'rental_authorization';
  }
  return activation.rentalActivated ? 'rental_active' : 'rental_authorization';
}

function resolveOwnerMeetupSubstateFromParts(
  activation: ReturnType<typeof resolveRentalActivationState>,
  completion: ReturnType<typeof resolvePickupHandoffCompletionState>,
  auth: ReturnType<typeof resolveAuthorizationProgressFromParts>,
  bothAtMeetup: boolean
): OwnerMeetupSubstate {
  if (activation.rentalActivated) return 'rental_active';
  const both = bothAtMeetup;
  if (!both) {
    if (completion.renterArrived) return 'renter_inspecting';
    return 'awaiting_renter_arrival';
  }
  if (!completion.renterConfirmedReceipt) return 'renter_inspecting';
  if (!auth.rentalAgreementReviewed) return 'renter_reviewing_agreement';
  if (!auth.securityHoldAuthorized) return 'renter_authorizing_hold';
  if (!auth.digitalSignatureComplete) return 'renter_signing';
  if (!activation.rentalActivated) return 'renter_activating';
  return 'rental_active';
}

function buildMeetupLifecyclePresentation(input: {
  phase: MeetupLifecyclePhase;
  activation: ReturnType<typeof resolveRentalActivationState>;
  completion: ReturnType<typeof resolvePickupHandoffCompletionState>;
  auth: ReturnType<typeof resolveAuthorizationProgressFromParts>;
  both: boolean;
  renterAtMeetup: boolean;
  ownerAtMeetup: boolean;
  viewerRole: 'renter' | 'owner';
  ownerSubstate: OwnerMeetupSubstate;
}): MeetupLifecyclePresentation {
  const theme = MEETUP_LIFECYCLE_THEME[input.phase];
  const progressIndex: MeetupLifecycleProgressIndex =
    input.phase === 'equipment_inspection' ? 0 : input.phase === 'rental_authorization' ? 1 : 2;
  const ownerProgressItems = buildOwnerProgressItems(input.ownerSubstate, input.auth);

  let renterHeadline = 'Equipment inspection';
  let renterSupport = 'Verify the item in person before continuing.';
  let ownerHeadline = 'Pickup in progress';
  let ownerSupport = 'The renter will complete inspection at the meetup.';

  if (input.phase === 'equipment_inspection') {
    if (!input.both) {
      renterHeadline = input.renterAtMeetup ? 'Waiting for owner' : 'Head to the meetup';
      renterSupport = input.renterAtMeetup
        ? 'You’re here — we’ll notify you when the owner arrives.'
        : 'Mark arrival when you reach the meetup location.';
      ownerHeadline = input.completion.renterArrived ? 'Renter is on the way' : 'Waiting for renter';
      ownerSupport = input.completion.renterArrived
        ? 'The renter marked arrival. Mark your arrival to begin inspection.'
        : 'The renter will review photos and mark arrival at the meetup.';
    } else if (!input.completion.renterConfirmedReceipt) {
      renterHeadline = 'Equipment inspection';
      renterSupport =
        'Review photos, verify condition and accessories, then confirm you received the equipment.';
      ownerHeadline = 'Renter is inspecting the equipment';
      ownerSupport = 'Inspection is in progress. You’ll see updates here in real time.';
    } else {
      renterHeadline = 'Inspection complete';
      renterSupport = 'Next up: review the rental agreement and authorize your rental.';
      ownerHeadline = 'Inspection complete';
      ownerSupport = 'The renter is moving on to agreement and authorization.';
    }
  } else if (input.phase === 'rental_authorization') {
    renterHeadline = 'Rental authorization';
    renterSupport = 'Review the agreement, authorize the hold, and sign to activate.';
    ownerHeadline = 'Renter is authorizing the rental';
    ownerSupport = 'Legal and payment steps happen on the renter’s device. No action needed from you.';
  } else {
    renterHeadline = 'Enjoy your rental';
    renterSupport = 'Your rental is officially active.';
    ownerHeadline = 'Rental is now active';
    ownerSupport = 'The rental timer has started.';
  }

  if (input.viewerRole === 'owner' && input.ownerSubstate === 'inspection_complete') {
    ownerHeadline = 'Inspection complete';
    ownerSupport = 'The renter confirmed the equipment. Authorization is next.';
  }

  return {
    phase: input.phase,
    phaseNumber: theme.phase,
    progressIndex,
    theme,
    inspectionComplete: input.completion.renterConfirmedReceipt,
    authorizationComplete:
      input.auth.preMeetupLegalComplete &&
      input.auth.securityHoldAuthorized &&
      input.auth.digitalSignatureComplete,
    rentalActivated: input.activation.rentalActivated,
    bothAtMeetup: input.both,
    renterAtMeetup: input.renterAtMeetup,
    ownerAtMeetup: input.ownerAtMeetup,
    ownerSubstate: input.ownerSubstate,
    renterHeadline,
    renterSupport,
    ownerHeadline,
    ownerSupport,
    ownerProgressItems,
  };
}

export function resolveMeetupLifecyclePresentation(
  ctx: RentalWizardContext,
  viewerRole: 'renter' | 'owner'
): MeetupLifecyclePresentation {
  const handoffInput = buildPickupHandoffCompletionInputFromWizard(ctx);
  const activation = resolveRentalActivationState(handoffInput);
  const completion = resolvePickupHandoffCompletionState(handoffInput);
  const auth = resolveAuthorizationProgress(ctx);
  const phase = resolveMeetupLifecyclePhase(ctx);
  const both = bothPartiesAtMeetup(ctx);

  return buildMeetupLifecyclePresentation({
    phase,
    activation,
    completion,
    auth,
    both,
    renterAtMeetup: Boolean(
      ctx.wizardProgress.renter_pickup_im_here_at?.trim() || ctx.rental.renter_arrived_at?.trim()
    ),
    ownerAtMeetup: Boolean(ctx.rental.owner_arrived_at?.trim()),
    viewerRole,
    ownerSubstate: resolveOwnerMeetupSubstate(ctx),
  });
}

function buildOwnerProgressItems(
  substate: OwnerMeetupSubstate,
  auth: ReturnType<typeof resolveAuthorizationProgress>
): MeetupLifecyclePresentation['ownerProgressItems'] {
  if (substate === 'awaiting_renter_arrival' || substate === 'renter_inspecting') {
    return [
      {
        id: 'started',
        label: 'Renter is reviewing the item',
        status: substate === 'renter_inspecting' ? 'active' : 'pending',
      },
      {
        id: 'possession',
        label: 'Renter confirms possession',
        status: 'pending',
      },
      { id: 'done', label: 'Inspection complete', status: 'pending' },
    ];
  }

  if (substate === 'inspection_complete' || substate.startsWith('renter_')) {
    const agreementStatus = auth.rentalAgreementReviewed
      ? 'done'
      : substate === 'renter_reviewing_agreement'
        ? 'active'
        : 'pending';
    const holdStatus = auth.securityHoldAuthorized
      ? 'done'
      : substate === 'renter_authorizing_hold'
        ? 'active'
        : 'pending';
    const signStatus = auth.digitalSignatureComplete
      ? 'done'
      : substate === 'renter_signing'
        ? 'active'
        : 'pending';

    return [
      { id: 'agreement', label: 'Rental agreement reviewed', status: agreementStatus },
      { id: 'hold', label: 'Security hold authorized', status: holdStatus },
      { id: 'signature', label: 'Agreement signed', status: signStatus },
    ];
  }

  return [
    { id: 'active', label: 'Rental is active', status: 'done' },
    { id: 'timer', label: 'Return due at end of rental', status: 'done' },
  ];
}
