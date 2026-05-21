import { logScenario } from '@/lib/rentalLifecycle/scenarioDevLog';
import {
  hasReturnCoordinationAgreed,
  hasReturnSchedule,
  isPickupCoordinationComplete,
} from '@/lib/rentalWizard/rentalWizardGates';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';

/** Comparable coordination flags for realtime prompt detection. */
export type WizardCoordinationSnapshot = {
  meetupCoordinationComplete: boolean;
  hasPendingProposal: boolean;
  lastProposedBy: string | null;
  pickupCoordinationComplete: boolean;
  pickupConfirmedSeen: boolean;
};

export type WizardReturnCoordinationSnapshot = {
  meetupCoordinationComplete: boolean;
  returnCoordinationAgreed: boolean;
  hasPendingProposal: boolean;
  lastProposedBy: string | null;
  pickupConfirmedSeen: boolean;
  returnConfirmedSeen: boolean;
  hasReturnSchedule: boolean;
};

/** DEV: relaxed trigger to verify overlay pipeline (see shouldShowPickupCoordinationAcceptedPrompt). */
export const LIFECYCLE_PROMPT_RELAXED_PICKUP_TRIGGER =
  typeof __DEV__ !== 'undefined' && __DEV__;

export function buildCoordinationSnapshot(ctx: RentalWizardContext): WizardCoordinationSnapshot {
  return {
    meetupCoordinationComplete: ctx.meetupCoordinationComplete,
    hasPendingProposal: ctx.hasPendingProposal,
    lastProposedBy: String(ctx.rental.last_proposed_by ?? '').trim() || null,
    pickupCoordinationComplete: isPickupCoordinationComplete(ctx),
    pickupConfirmedSeen: ctx.seenTransitions.has('pickup_confirmed_seen'),
  };
}

export function buildReturnCoordinationSnapshot(
  ctx: RentalWizardContext
): WizardReturnCoordinationSnapshot {
  return {
    meetupCoordinationComplete: ctx.meetupCoordinationComplete,
    returnCoordinationAgreed: hasReturnCoordinationAgreed(ctx),
    hasPendingProposal: ctx.hasPendingProposal,
    lastProposedBy: String(ctx.rental.last_proposed_by ?? '').trim() || null,
    pickupConfirmedSeen: ctx.seenTransitions.has('pickup_confirmed_seen'),
    returnConfirmedSeen: ctx.seenTransitions.has('return_confirmed_seen'),
    hasReturnSchedule: hasReturnSchedule(ctx),
  };
}

export type PickupCoordinationPromptEvaluation = {
  show: boolean;
  relaxed: boolean;
  reasons: string[];
};

/**
 * Owner accepted renter's pickup proposal while renter was waiting on Screen 1.
 * Requires a prior snapshot from before the realtime refresh (layout captures this).
 */
export function evaluatePickupCoordinationAcceptedPrompt(
  previous: WizardCoordinationSnapshot | null,
  current: WizardCoordinationSnapshot,
  viewerUserId: string
): PickupCoordinationPromptEvaluation {
  const reasons: string[] = [];
  if (!previous) {
    reasons.push('no_previous_snapshot');
    return { show: false, relaxed: LIFECYCLE_PROMPT_RELAXED_PICKUP_TRIGGER, reasons };
  }

  if (LIFECYCLE_PROMPT_RELAXED_PICKUP_TRIGGER) {
    const show =
      previous.hasPendingProposal === true && current.pickupCoordinationComplete === true;
    if (!previous.hasPendingProposal) reasons.push('relaxed:previous.hasPendingProposal!==true');
    if (!current.pickupCoordinationComplete) {
      reasons.push('relaxed:next.pickupCoordinationComplete!==true');
    }
    if (show) reasons.push('relaxed:trigger_matched');
    return { show, relaxed: true, reasons };
  }

  if (current.pickupConfirmedSeen) reasons.push('pickup_confirmed_seen');
  if (!current.pickupCoordinationComplete) reasons.push('pickup_coordination_incomplete');
  if (previous.pickupCoordinationComplete) reasons.push('previous_already_pickup_complete');

  const renterWasWaiting =
    previous.hasPendingProposal && previous.lastProposedBy === viewerUserId.trim();
  if (!renterWasWaiting) {
    reasons.push('renter_was_not_waiting');
    if (!previous.hasPendingProposal) reasons.push('previous.hasPendingProposal=false');
    if (previous.lastProposedBy !== viewerUserId.trim()) {
      reasons.push(
        `previous.lastProposedBy=${previous.lastProposedBy ?? 'null'} viewer=${viewerUserId.trim()}`
      );
    }
  }

  const show =
    !current.pickupConfirmedSeen &&
    current.pickupCoordinationComplete &&
    !previous.pickupCoordinationComplete &&
    renterWasWaiting;

  if (show) reasons.push('strict:trigger_matched');
  return { show, relaxed: false, reasons };
}

export function shouldShowPickupCoordinationAcceptedPrompt(
  previous: WizardCoordinationSnapshot | null,
  current: WizardCoordinationSnapshot,
  viewerUserId: string
): boolean {
  return evaluatePickupCoordinationAcceptedPrompt(previous, current, viewerUserId).show;
}

export function logPickupCoordinationPromptDetection(
  rentalId: string,
  source: string,
  previous: WizardCoordinationSnapshot | null,
  current: WizardCoordinationSnapshot,
  evaluation: PickupCoordinationPromptEvaluation,
  extra?: Record<string, unknown>
): void {
  logScenario('transition', {
    event: 'pickup_coordination_prompt_evaluated',
    rentalId,
    source,
    relaxed: evaluation.relaxed,
    trigger: evaluation.show,
    reasons: evaluation.reasons.join('|') || 'none',
    previous_hasPendingProposal: previous?.hasPendingProposal ?? null,
    previous_lastProposedBy: previous?.lastProposedBy ?? null,
    previous_meetupCoordinationComplete: previous?.meetupCoordinationComplete ?? null,
    previous_pickupCoordinationComplete: previous?.pickupCoordinationComplete ?? null,
    next_meetupCoordinationComplete: current.meetupCoordinationComplete,
    next_hasPendingProposal: current.hasPendingProposal,
    next_pickupCoordinationComplete: current.pickupCoordinationComplete,
    next_pickupConfirmedSeen: current.pickupConfirmedSeen,
    ...extra,
  });
}

export function logLifecyclePromptShown(
  rentalId: string,
  promptType: 'pickup_coordination_accepted' | 'return_coordination_accepted'
): void {
  logScenario('transition', {
    event: 'lifecycle_prompt_shown',
    rentalId,
    promptType,
    source: 'wizard_lifecycle_prompt',
  });
}

export type ReturnCoordinationPromptEvaluation = {
  show: boolean;
  relaxed: boolean;
  reasons: string[];
};

export function evaluateReturnCoordinationAcceptedPrompt(
  previous: WizardReturnCoordinationSnapshot | null,
  current: WizardReturnCoordinationSnapshot,
  viewerUserId: string
): ReturnCoordinationPromptEvaluation {
  const reasons: string[] = [];
  if (!previous) {
    reasons.push('no_previous_snapshot');
    return { show: false, relaxed: false, reasons };
  }

  if (current.returnConfirmedSeen) reasons.push('return_confirmed_seen');
  if (!current.pickupConfirmedSeen) reasons.push('pickup_confirmed_not_seen');
  if (!current.returnCoordinationAgreed) reasons.push('return_not_agreed');
  if (previous.returnCoordinationAgreed) reasons.push('previous_already_return_agreed');

  const wasWaiting =
    previous.hasPendingProposal && previous.lastProposedBy === viewerUserId.trim();
  if (!wasWaiting) {
    reasons.push('viewer_was_not_waiting');
  }

  const show =
    !current.returnConfirmedSeen &&
    current.pickupConfirmedSeen &&
    current.returnCoordinationAgreed &&
    !previous.returnCoordinationAgreed &&
    wasWaiting;

  if (show) reasons.push('strict:trigger_matched');
  return { show, relaxed: false, reasons };
}

export function logReturnCoordinationPromptDetection(
  rentalId: string,
  source: string,
  previous: WizardReturnCoordinationSnapshot | null,
  current: WizardReturnCoordinationSnapshot,
  evaluation: ReturnCoordinationPromptEvaluation,
  extra?: Record<string, unknown>
): void {
  logScenario('transition', {
    event: 'return_coordination_prompt_evaluated',
    rentalId,
    source,
    relaxed: evaluation.relaxed,
    trigger: evaluation.show,
    reasons: evaluation.reasons.join('|') || 'none',
    previous_hasPendingProposal: previous?.hasPendingProposal ?? null,
    previous_lastProposedBy: previous?.lastProposedBy ?? null,
    previous_meetupCoordinationComplete: previous?.meetupCoordinationComplete ?? null,
    next_meetupCoordinationComplete: current.meetupCoordinationComplete,
    next_returnCoordinationAgreed: current.returnCoordinationAgreed,
    next_hasPendingProposal: current.hasPendingProposal,
    next_returnConfirmedSeen: current.returnConfirmedSeen,
    next_hasReturnSchedule: current.hasReturnSchedule,
    ...extra,
  });
}

export function logLifecyclePromptHold(
  rentalId: string,
  event: 'hold_enabled' | 'hold_cleared' | 'overlay_shown' | 'overlay_dismissed',
  extra?: Record<string, unknown>
): void {
  logScenario('transition', {
    event,
    rentalId,
    source: 'wizard_lifecycle_prompt',
    ...extra,
  });
}
