import type { RentalWorkspacePrimaryStageModel } from '@/lib/rentalWorkspacePrimaryStageModel';
import type { RentalOperationalState } from '@/lib/rentalOperationalAttention';
import type { RentalWorkspaceViewerRole } from '@/lib/rentalWorkspaceRoleCopy';

export type CommandCenterTone = 'info' | 'attention' | 'urgent' | 'complete';

export type CommandCenterOperationalState =
  | 'informational'
  | 'waiting_on_renter'
  | 'waiting_on_owner'
  | 'action_required'
  | 'meetup_overdue'
  | 'return_overdue'
  | 'extension_requested'
  | 'review_pending'
  | 'complete';

export type CommandCenterStepKey = 'pickup' | 'active' | 'return';

export type CommandCenterStep = {
  key: CommandCenterStepKey;
  label: string;
  done: boolean;
  current: boolean;
  timelineLabel: string;
  /** Compact subtitle under stage label in the dock (e.g. "Complete", "Return in 2 days"). */
  subline: string;
};

export type CommandCenterTimelineRow = {
  icon: 'done' | 'current' | 'upcoming';
  label: string;
};

export type CommandCenterCta = {
  label: string;
  disabled: boolean;
};

export type RentalCommandCenterModel = {
  steps: CommandCenterStep[];
  tone: CommandCenterTone;
  operationalState: CommandCenterOperationalState;
  /** Collapsed one-liner under the track */
  contextLine: string;
  expandedEyebrow: string;
  scheduleLine: string | null;
  locationLine: string | null;
  detailLine: string;
  primaryCta: CommandCenterCta | null;
  secondaryCta: CommandCenterCta | null;
  timelineRows: CommandCenterTimelineRow[];
};

function parseScheduleMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function formatReturnDueLine(iso: string | null | undefined): string | null {
  const t = parseScheduleMs(iso);
  if (t == null) return null;
  const d = new Date(t);
  const datePart = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timePart = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `Return due ${datePart} · ${timePart}`;
}

function relativeReturnContext(iso: string | null | undefined, nowMs: number): string | null {
  const t = parseScheduleMs(iso);
  if (t == null) return null;
  const ms = t - nowMs;
  const hours = Math.floor(ms / 3600000);
  const days = Math.floor(ms / 86400000);
  if (ms < -36 * 3600000) return 'Return overdue';
  if (ms < 0) return 'Return window is here';
  if (hours < 36) return `Return in about ${Math.max(1, hours)} hour${hours === 1 ? '' : 's'}`;
  if (days <= 14) return `Return in ${days} day${days === 1 ? '' : 's'}`;
  return null;
}

function stepTimelineLabel(step: CommandCenterStep): string {
  if (step.done) {
    if (step.key === 'pickup') return 'Pickup complete';
    if (step.key === 'active') return 'On rent';
    return 'Return complete';
  }
  if (step.current) {
    if (step.key === 'pickup') return 'Pickup in progress';
    if (step.key === 'active') return 'Active rental';
    return 'Return pending';
  }
  if (step.key === 'pickup') return 'Pickup';
  if (step.key === 'active') return 'Active rental';
  return 'Return';
}

function mapEyebrow(stageLabel: string, currentKey: CommandCenterStepKey): string {
  const s = stageLabel.trim().toUpperCase();
  if (s.includes('ON RENT') || currentKey === 'active') return 'ACTIVE RENTAL';
  if (s.includes('RETURN') || currentKey === 'return') return 'RETURN';
  if (s.includes('PICKUP') || currentKey === 'pickup') return 'PICKUP HANDOFF';
  if (s.includes('COORDINATE') || s.includes('AGREEMENT')) return 'COORDINATION';
  if (s === 'COMPLETE') return 'RENTAL COMPLETE';
  return s || 'RENTAL';
}

export function buildRentalCommandCenterModel(input: {
  viewerRole: RentalWorkspaceViewerRole;
  lifecyclePhase: 'pickup' | 'active' | 'return' | 'completed';
  rentalStatus: string;
  meetupCoordinationComplete: boolean;
  pickupHandoffComplete: boolean;
  returnHandoffComplete: boolean;
  pickupOperationalState: RentalOperationalState | null;
  returnOperationalState: RentalOperationalState | null;
  pickupIso: string | null;
  returnIso: string | null;
  returnLocation: string | null;
  hasPendingExtension: boolean;
  renterReturnPhotoCount: number;
  primaryStage: RentalWorkspacePrimaryStageModel;
  nowMs?: number;
}): RentalCommandCenterModel {
  const now = input.nowMs ?? Date.now();
  const st = String(input.rentalStatus ?? '').trim().toLowerCase();
  const completed = ['returned', 'completed', 'cancelled'].includes(st) || input.lifecyclePhase === 'completed';

  const pickupDone = input.pickupHandoffComplete;
  const activeDone =
    pickupDone &&
    (input.lifecyclePhase === 'return' ||
      input.lifecyclePhase === 'completed' ||
      st === 'return_pending');
  const returnDone = input.returnHandoffComplete || completed;

  let currentKey: CommandCenterStepKey = 'pickup';
  if (completed || returnDone) currentKey = 'return';
  else if (input.lifecyclePhase === 'return' && pickupDone) currentKey = 'return';
  else if (pickupDone && input.lifecyclePhase === 'active') currentKey = 'active';
  else if (!pickupDone) currentKey = 'pickup';

  const steps: CommandCenterStep[] = [
    {
      key: 'pickup',
      label: 'Pickup',
      done: pickupDone,
      current: currentKey === 'pickup',
      timelineLabel: '',
      subline: '',
    },
    {
      key: 'active',
      label: 'Active',
      done: activeDone,
      current: currentKey === 'active',
      timelineLabel: '',
      subline: '',
    },
    {
      key: 'return',
      label: 'Return',
      done: returnDone,
      current: currentKey === 'return',
      timelineLabel: '',
      subline: '',
    },
  ];
  let contextLine = 'Rental in progress';
  let detailLine = input.primaryStage.summaryLine;
  const relReturn = relativeReturnContext(input.returnIso, now);

  for (const step of steps) {
    step.timelineLabel = stepTimelineLabel(step);
  }

  const timelineRows: CommandCenterTimelineRow[] = steps.map((step) => ({
    icon: step.done ? 'done' : step.current ? 'current' : 'upcoming',
    label: step.timelineLabel,
  }));

  let tone: CommandCenterTone = 'info';
  let operationalState: CommandCenterOperationalState = 'informational';

  const scheduleLine = formatReturnDueLine(input.returnIso);
  const locTrim = (input.returnLocation ?? '').trim();
  const locationLine =
    locTrim.length > 0 ? `Drop-off: ${locTrim}` : null;

  if (completed || returnDone) {
    tone = 'complete';
    operationalState = 'complete';
    contextLine = 'Rental complete';
    detailLine = 'Return recorded — verification stays on file.';
  } else if (
    input.pickupOperationalState === 'missed_confirmation' ||
    input.returnOperationalState === 'missed_confirmation'
  ) {
    tone = 'urgent';
    operationalState =
      input.returnOperationalState === 'missed_confirmation' ? 'return_overdue' : 'meetup_overdue';
    contextLine =
      operationalState === 'return_overdue' ? 'Return window passed' : 'Pickup window passed';
    detailLine =
      input.viewerRole === 'owner'
        ? operationalState === 'return_overdue'
          ? 'Review return or coordinate in Messages.'
          : 'Confirm handoff or report an issue.'
        : operationalState === 'return_overdue'
          ? 'Finish return photos or coordinate drop-off.'
          : 'Confirm receipt or update the host.';
  } else if (input.pickupOperationalState === 'no_show_reported' || input.returnOperationalState === 'no_show_reported') {
    tone = 'urgent';
    operationalState = 'meetup_overdue';
    contextLine = 'Issue reported';
    detailLine = 'Our team may follow up — keep Messages open.';
  } else if (input.hasPendingExtension) {
    tone = 'attention';
    operationalState = 'extension_requested';
    contextLine = 'Extension requested';
    detailLine =
      input.viewerRole === 'owner'
        ? 'Respond to keep return timing accurate.'
        : `Waiting on the owner to respond.`;
  } else if (!input.meetupCoordinationComplete) {
    tone = 'attention';
    operationalState = 'action_required';
    contextLine = 'Meetup not confirmed';
    detailLine = 'Confirm pickup and return details.';
  } else if (!pickupDone) {
    tone = 'attention';
    operationalState = 'action_required';
    contextLine = input.viewerRole === 'owner' ? 'Pickup incomplete' : 'Confirm when ready';
    detailLine =
      input.viewerRole === 'owner'
        ? 'Photos and checklist, then confirm when ready.'
        : 'Review host photos and confirm receipt.';
  } else if (currentKey === 'active') {
    tone = 'info';
    operationalState = 'informational';
    contextLine = relReturn ?? (input.viewerRole === 'owner' ? 'On rent' : 'You have the item');
    detailLine =
      input.primaryStage.urgencyLine?.trim() ||
      input.primaryStage.contextLine?.trim() ||
      input.primaryStage.summaryLine;
  } else if (currentKey === 'return') {
    if (input.viewerRole === 'owner') {
      if (input.renterReturnPhotoCount === 0) {
        tone = 'attention';
        operationalState = 'waiting_on_renter';
        contextLine = 'Waiting on renter photos';
        detailLine = 'Return photos appear here when the renter uploads them.';
      } else if (!input.returnHandoffComplete) {
        tone = 'attention';
        operationalState = 'review_pending';
        contextLine = 'Owner review pending';
        detailLine = 'Review return photos and confirm condition.';
      } else {
        tone = 'complete';
        operationalState = 'complete';
        contextLine = 'Return recorded';
        detailLine = 'This rental is wrapping up.';
      }
    } else {
      tone = 'attention';
      operationalState = 'action_required';
      contextLine =
        input.renterReturnPhotoCount < 3 ? 'Finish return photos' : 'Complete return checklist';
      detailLine = 'Add photos and checklist items before drop-off.';
    }
  }

  if (input.pickupOperationalState === 'running_late' || input.returnOperationalState === 'running_late') {
    tone = 'attention';
    operationalState = 'informational';
    contextLine = 'Running late';
    detailLine = 'Keep each other posted in Messages.';
  }

  const expandedEyebrow = mapEyebrow(input.primaryStage.stageLabel, currentKey);

  const primaryCta: CommandCenterCta | null = input.primaryStage.onPrimary
    ? {
        label: input.primaryStage.primaryLabel,
        disabled: input.primaryStage.primaryDisabled,
      }
    : null;

  const secondaryCta: CommandCenterCta = { label: 'Open messages', disabled: false };

  const assignStepSubline = (step: CommandCenterStep) => {
    if (step.done) {
      step.subline = step.key === 'pickup' ? 'Complete' : step.key === 'active' ? 'Complete' : 'Complete';
      return;
    }
    if (step.current) {
      if (step.key === 'pickup') step.subline = 'In progress';
      else if (step.key === 'active') step.subline = relReturn ?? 'On rent';
      else step.subline = 'In progress';
      return;
    }
    step.subline = 'Pending';
  };
  for (const step of steps) assignStepSubline(step);

  return {
    steps,
    tone,
    operationalState,
    contextLine,
    expandedEyebrow,
    scheduleLine,
    locationLine,
    detailLine,
    primaryCta,
    secondaryCta,
    timelineRows,
  };
}

/** Layout constants for scroll padding */
export const RENTAL_COMMAND_CENTER_DOCK_MARGIN_H = 14;
export const RENTAL_COMMAND_CENTER_GAP_ABOVE_TAB = 10;
export const RENTAL_COMMAND_CENTER_COLLAPSED_HEIGHT = 88;
export const RENTAL_COMMAND_CENTER_COLLAPSED_COMPACT = 76;
export const RENTAL_COMMAND_CENTER_EXPANDED_HEIGHT = 228;

export function commandCenterBottomPadding(
  bottomInset: number,
  expanded: boolean,
  compact: boolean
): number {
  const bar = expanded
    ? RENTAL_COMMAND_CENTER_EXPANDED_HEIGHT
    : compact
      ? RENTAL_COMMAND_CENTER_COLLAPSED_COMPACT
      : RENTAL_COMMAND_CENTER_COLLAPSED_HEIGHT;
  return bottomInset + bar + RENTAL_COMMAND_CENTER_GAP_ABOVE_TAB + 6;
}
