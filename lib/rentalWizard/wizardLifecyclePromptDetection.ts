import { logScenario } from '@/lib/rentalLifecycle/scenarioDevLog';
import { isPickupCoordinationComplete } from '@/lib/rentalWizard/rentalWizardGates';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';

/** Comparable coordination flags for realtime prompt detection. */
export type WizardCoordinationSnapshot = {
  meetingCompleted: boolean;
  hasPendingProposal: boolean;
  lastProposedBy: string | null;
  pickupCoordinationComplete: boolean;
  pickupConfirmedSeen: boolean;
};

/** DEV: relaxed trigger to verify overlay pipeline (see shouldShowPickupCoordinationAcceptedPrompt). */
export const LIFECYCLE_PROMPT_RELAXED_PICKUP_TRIGGER =
  typeof __DEV__ !== 'undefined' && __DEV__;

export function buildCoordinationSnapshot(ctx: RentalWizardContext): WizardCoordinationSnapshot {
  return {
    meetingCompleted: ctx.meetingCompleted,
    hasPendingProposal: ctx.hasPendingProposal,
    lastProposedBy: String(ctx.rental.last_proposed_by ?? '').trim() || null,
    pickupCoordinationComplete: isPickupCoordinationComplete(ctx),
    pickupConfirmedSeen: ctx.seenTransitions.has('pickup_confirmed_seen'),
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
  if (!current.meetingCompleted) reasons.push('meeting_not_completed');
  if (previous.meetingCompleted) reasons.push('previous_already_meeting_completed');

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
    current.meetingCompleted &&
    !previous.meetingCompleted &&
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
    previous_meetingCompleted: previous?.meetingCompleted ?? null,
    previous_pickupCoordinationComplete: previous?.pickupCoordinationComplete ?? null,
    next_meetingCompleted: current.meetingCompleted,
    next_hasPendingProposal: current.hasPendingProposal,
    next_pickupCoordinationComplete: current.pickupCoordinationComplete,
    next_pickupConfirmedSeen: current.pickupConfirmedSeen,
    ...extra,
  });
}

export function logLifecyclePromptShown(
  rentalId: string,
  promptType: 'pickup_coordination_accepted'
): void {
  logScenario('transition', {
    event: 'lifecycle_prompt_shown',
    rentalId,
    promptType,
    source: 'wizard_lifecycle_prompt',
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
