import type { RentalWorkspaceStage } from '@/lib/rentalLifecyclePhase';
import type { RentalWorkspaceUxPhase } from '@/lib/rentalWorkspaceUxPhase';

/** Visual / copy lane for the stage workbench shell (UI only). */
export type RentalWorkspaceBenchTone =
  | 'coordination'
  | 'pickup'
  | 'active'
  | 'return'
  | 'closure'
  | 'neutral';

export type RentalWorkspaceSecondaryAction = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

/** Compact “one focus” card for the rental workspace (UI only). */
export type RentalWorkspacePrimaryStageModel = {
  stageLabel: string;
  summaryLine: string;
  primaryLabel: string;
  primaryDisabled: boolean;
  onPrimary?: () => void;
  benchTone: RentalWorkspaceBenchTone;
  /** Short operational line (timing, location, progress). */
  contextLine: string | null;
  secondaryAction: RentalWorkspaceSecondaryAction | null;
};

type PrimaryResolveInput = {
  uxPhase: RentalWorkspaceUxPhase;
  workspaceStage: RentalWorkspaceStage;
  viewerRole: 'owner' | 'renter';
  workspaceGuidanceLine: string | null;
  termsCompleted: boolean;
  meetingCompleted: boolean;
  showMeetingAccept: boolean;
  showMeetingPrimaryAction: boolean;
  showMeetingPendingPill: boolean;
  proposalBusy: boolean;
  pickupPrimaryLabel: string;
  pickupPrimaryDisabled: boolean;
  pickupPrimaryOnPress: (() => void) | undefined;
  pickupPrimaryFootnote: string;
  returnCompleted: boolean;
  returnWorkflowEnabled: boolean;
  returnReady: boolean;
  /** Human pickup/return timing for ACTIVE summary (e.g. compact date/time). */
  returnScheduleLabel: string | null;
  counterpartyFirstName: string;
  /** Parent-built status line (countdown, checklist counts, etc.). */
  extraContextLine: string | null;
  onReportIssue: () => void;
  onOpenMeetingProposal: () => void;
  onFocusTermsSection: () => void;
  onFocusMeetingSection: () => void;
  onFocusPickupSection: () => void;
  onFocusReturnSection: () => void;
  onOpenChat: () => void;
  onConfirmReturn: () => void;
};

function shortPickupSummary(input: PrimaryResolveInput): string {
  const foot = input.pickupPrimaryFootnote.trim();
  if (foot) return foot.split('.')[0] + (foot.includes('.') ? '.' : '');
  return input.viewerRole === 'owner'
    ? 'Finish photos and checklist, then confirm when ready.'
    : 'Review evidence and confirm receipt when ready.';
}

function issueAction(input: PrimaryResolveInput): RentalWorkspaceSecondaryAction {
  return { label: 'Report issue', onPress: input.onReportIssue, disabled: false };
}

export function resolveRentalWorkspacePrimaryStageModel(
  input: PrimaryResolveInput
): RentalWorkspacePrimaryStageModel {
  const who = input.counterpartyFirstName.trim() || 'the other party';
  const guide = (input.workspaceGuidanceLine ?? '').trim();
  const sched =
    input.returnScheduleLabel && input.returnScheduleLabel !== 'Not set'
      ? input.returnScheduleLabel.trim()
      : null;
  const ctx = (input.extraContextLine ?? '').trim() || null;

  if (input.uxPhase === 'CANCELLED') {
    return {
      stageLabel: 'CANCELLED',
      summaryLine: 'This rental is no longer active.',
      primaryLabel: 'Open messages',
      primaryDisabled: false,
      onPrimary: input.onOpenChat,
      benchTone: 'neutral',
      contextLine: null,
      secondaryAction: null,
    };
  }
  if (input.uxPhase === 'DECLINED') {
    return {
      stageLabel: 'DECLINED',
      summaryLine: 'This request did not move forward.',
      primaryLabel: 'Open messages',
      primaryDisabled: false,
      onPrimary: input.onOpenChat,
      benchTone: 'neutral',
      contextLine: null,
      secondaryAction: null,
    };
  }
  if (input.uxPhase === 'REQUEST_PENDING') {
    return {
      stageLabel: 'REQUEST PENDING',
      summaryLine: guide || 'Waiting for both sides to finalize acceptance.',
      primaryLabel: 'Open messages',
      primaryDisabled: false,
      onPrimary: input.onOpenChat,
      benchTone: 'neutral',
      contextLine: ctx,
      secondaryAction: null,
    };
  }
  if (input.uxPhase === 'COMPLETED') {
    return {
      stageLabel: 'COMPLETE',
      summaryLine:
        guide ||
        'This rental is wrapped up here. Messages and verification stay on file if you need them later.',
      primaryLabel: 'Open messages',
      primaryDisabled: false,
      onPrimary: input.onOpenChat,
      benchTone: 'closure',
      contextLine: ctx,
      secondaryAction: null,
    };
  }

  if (input.workspaceStage === 'agreement') {
    if (!input.termsCompleted) {
      return {
        stageLabel: 'AGREEMENT',
        summaryLine: guide || 'Lock in pricing, protection, and preauthorization — then you can plan the meetup.',
        primaryLabel: 'Review terms',
        primaryDisabled: false,
        onPrimary: input.onFocusTermsSection,
        benchTone: 'coordination',
        contextLine: ctx,
        secondaryAction: null,
      };
    }
    if (!input.meetingCompleted) {
      if (input.showMeetingAccept) {
        return {
          stageLabel: 'COORDINATE',
          summaryLine: guide || `${who} sent a meetup proposal — accept it or suggest a change.`,
          primaryLabel: input.proposalBusy ? 'Saving…' : 'Respond to meetup',
          primaryDisabled: input.proposalBusy,
          onPrimary: input.onFocusMeetingSection,
          benchTone: 'coordination',
          contextLine: ctx,
          secondaryAction: null,
        };
      }
      if (input.showMeetingPrimaryAction) {
        if (input.showMeetingPendingPill) {
          return {
            stageLabel: 'COORDINATE',
            summaryLine: guide || `Waiting on ${who} to respond to your meetup proposal.`,
            primaryLabel: 'Open messages',
            primaryDisabled: false,
            onPrimary: input.onOpenChat,
            benchTone: 'coordination',
            contextLine: ctx,
            secondaryAction: null,
          };
        }
        const proposeLabel = input.viewerRole === 'owner' ? 'Propose meetup' : 'Suggest times';
        return {
          stageLabel: 'COORDINATE',
          summaryLine:
            guide ||
            (input.viewerRole === 'owner'
              ? `Confirm pickup and return with ${who} so both sides know where to meet.`
              : `Propose pickup and return times that work for you and ${who}.`),
          primaryLabel: input.proposalBusy ? 'Saving…' : proposeLabel,
          primaryDisabled: input.proposalBusy,
          onPrimary: input.onOpenMeetingProposal,
          benchTone: 'coordination',
          contextLine: ctx,
          secondaryAction: null,
        };
      }
      return {
        stageLabel: 'COORDINATE',
        summaryLine: guide || 'Open meetup details to finish pickup and return scheduling.',
        primaryLabel: 'Open meetup',
        primaryDisabled: false,
        onPrimary: input.onFocusMeetingSection,
        benchTone: 'coordination',
        contextLine: ctx,
        secondaryAction: null,
      };
    }
  }

  if (input.workspaceStage === 'pickup_prep') {
    return {
      stageLabel: 'PICKUP PREP',
      summaryLine: shortPickupSummary(input),
      primaryLabel: input.pickupPrimaryLabel || 'Continue',
      primaryDisabled: input.pickupPrimaryDisabled,
      onPrimary: input.pickupPrimaryOnPress,
      benchTone: 'pickup',
      contextLine: ctx,
      secondaryAction: null,
    };
  }

  if (input.workspaceStage === 'active') {
    const ownerSummary = sched
      ? `The renter has your item until ${sched}. Stay in the thread for return questions or plan changes.`
      : guide ||
        'Your listing is live — keep pickup and return notes, photos, and timing in Messages so nothing drifts.';
    const renterSummary = sched
      ? `You’re on the clock until ${sched}. Line up return photos and drop-off details before the window closes.`
      : guide ||
        'You have the gear — treat it well, keep the owner posted, and document anything unusual in Messages.';
    return {
      stageLabel: 'ON RENT',
      summaryLine: input.viewerRole === 'owner' ? ownerSummary : renterSummary,
      primaryLabel: 'Open messages',
      primaryDisabled: false,
      onPrimary: input.onOpenChat,
      benchTone: 'active',
      contextLine: ctx,
      secondaryAction: issueAction(input),
    };
  }

  if (input.workspaceStage === 'return') {
    if (input.viewerRole === 'owner' && input.returnReady && !input.returnCompleted) {
      return {
        stageLabel: 'RETURN',
        summaryLine: guide || 'When drop-off looks right, confirm so both sides get a clean close.',
        primaryLabel: 'Confirm return',
        primaryDisabled: false,
        onPrimary: input.onConfirmReturn,
        benchTone: 'return',
        contextLine: ctx,
        secondaryAction: input.returnCompleted ? null : issueAction(input),
      };
    }
    return {
      stageLabel: 'RETURN',
      summaryLine:
        guide ||
        (input.returnCompleted
          ? 'Return is recorded — evidence below is read-only.'
          : 'Work through return photos, checklist, and notes, then confirm when you’re satisfied.'),
      primaryLabel: input.returnCompleted ? 'Open messages' : 'Open return',
      primaryDisabled: !input.returnWorkflowEnabled || input.returnCompleted,
      onPrimary: input.returnCompleted ? input.onOpenChat : input.onFocusReturnSection,
      benchTone: 'return',
      contextLine: ctx,
      secondaryAction: input.returnCompleted ? null : issueAction(input),
    };
  }

  return {
    stageLabel: 'RENTAL',
    summaryLine: guide || 'Use Messages to reach your match.',
    primaryLabel: 'Open messages',
    primaryDisabled: false,
    onPrimary: input.onOpenChat,
    benchTone: 'neutral',
    contextLine: ctx,
    secondaryAction: null,
  };
}
