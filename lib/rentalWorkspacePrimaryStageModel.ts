import type { RentalWorkspaceStage } from '@/lib/rentalLifecyclePhase';
import {
  activeExtensionUrgencyLine,
  activeOnRentSummaryLine,
} from '@/lib/rentalWorkspaceRoleCopy';
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
  /** Active-stage urgency line (extensions, deadlines). */
  urgencyLine?: string | null;
  secondaryAction: RentalWorkspaceSecondaryAction | null;
};

type PrimaryResolveInput = {
  uxPhase: RentalWorkspaceUxPhase;
  workspaceStage: RentalWorkspaceStage;
  viewerRole: 'owner' | 'renter';
  workspaceGuidanceLine: string | null;
  termsCompleted: boolean;
  meetupCoordinationComplete: boolean;
  showMeetingAccept: boolean;
  /** Active rental: pending proposal crosses contractual return day. */
  showExtensionAccept: boolean;
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
  onRequestExtension: () => void;
  onApproveExtension: () => void;
  onDeclineExtension: () => void;
  onManageReturn: () => void;
};

function shortPickupSummary(input: PrimaryResolveInput): string {
  const foot = input.pickupPrimaryFootnote.trim();
  if (foot) return foot.split('.')[0] + (foot.includes('.') ? '.' : '');
  return input.viewerRole === 'owner'
    ? 'Finish photos and checklist, then confirm when ready.'
    : 'Review the host’s photos and confirm receipt when ready.';
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
    if (!input.meetupCoordinationComplete) {
      if (input.showMeetingAccept) {
        return {
          stageLabel: 'COORDINATE',
          summaryLine:
            guide ||
            `${who} sent pickup or return details — accept or suggest a change for the phase that needs your response.`,
          primaryLabel: input.proposalBusy ? 'Saving…' : 'Respond to proposal',
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
            summaryLine:
              guide || `Waiting on ${who} to respond to your pickup or return proposal.`,
            primaryLabel: 'Open messages',
            primaryDisabled: false,
            onPrimary: input.onOpenChat,
            benchTone: 'coordination',
            contextLine: ctx,
            secondaryAction: null,
          };
        }
        const proposeLabel = input.viewerRole === 'owner' ? 'Propose pickup' : 'Suggest pickup';
        return {
          stageLabel: 'COORDINATE',
          summaryLine:
            guide ||
            (input.viewerRole === 'owner'
              ? `Confirm pickup first, then return details with ${who}. Each phase is coordinated separately.`
              : `Propose pickup details that work for you and ${who}. Return coordination unlocks after pickup is confirmed.`),
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
        summaryLine: guide || 'Open meetup coordination to finish pickup and return scheduling.',
        primaryLabel: 'Open coordination',
        primaryDisabled: false,
        onPrimary: input.onFocusMeetingSection,
        benchTone: 'coordination',
        contextLine: ctx,
        secondaryAction: null,
      };
    }
  }

  if (input.workspaceStage === 'pickup_authorization') {
    return {
      stageLabel: 'AUTHORIZE',
      summaryLine:
        guide ||
        (input.viewerRole === 'renter'
          ? 'Review the agreement, authorize the security hold, and sign to officially activate your rental.'
          : `Waiting for ${who} to complete rental authorization.`),
      primaryLabel:
        input.viewerRole === 'renter' ? 'Complete authorization' : 'Open messages',
      primaryDisabled: input.viewerRole !== 'renter',
      onPrimary:
        input.viewerRole === 'renter'
          ? input.onFocusPickupSection
          : input.onOpenChat,
      benchTone: 'pickup',
      contextLine: ctx,
      secondaryAction: null,
    };
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
    const summaryLine = activeOnRentSummaryLine(input.viewerRole, sched);
    const urgencyLine = activeExtensionUrgencyLine(input.viewerRole);

    if (input.showExtensionAccept) {
      return {
        stageLabel: 'ON RENT',
        summaryLine:
          guide ||
          (input.viewerRole === 'owner'
            ? `${who} requested a return extension — approve or decline to keep late fees accurate.`
            : `Waiting on ${who} to respond to your extension request.`),
        primaryLabel: input.proposalBusy ? 'Saving…' : 'Approve extension',
        primaryDisabled: input.proposalBusy,
        onPrimary: input.onApproveExtension,
        benchTone: 'active',
        contextLine: ctx,
        urgencyLine,
        secondaryAction: {
          label: 'Decline',
          onPress: input.onDeclineExtension,
          disabled: input.proposalBusy,
        },
      };
    }

    if (input.showMeetingAccept) {
      return {
        stageLabel: 'ON RENT',
        summaryLine: guide || `${who} sent a meetup proposal — accept it or suggest a change.`,
        primaryLabel: input.proposalBusy ? 'Saving…' : 'Respond to meetup',
        primaryDisabled: input.proposalBusy,
        onPrimary: input.onFocusMeetingSection,
        benchTone: 'active',
        contextLine: ctx,
        urgencyLine,
        secondaryAction: issueAction(input),
      };
    }

    if (input.showMeetingPendingPill) {
      return {
        stageLabel: 'ON RENT',
        summaryLine: guide || `Extension pending — waiting on ${who} to respond.`,
        primaryLabel: 'Open messages',
        primaryDisabled: false,
        onPrimary: input.onOpenChat,
        benchTone: 'active',
        contextLine: ctx,
        urgencyLine,
        secondaryAction: issueAction(input),
      };
    }

    if (input.viewerRole === 'renter') {
      return {
        stageLabel: 'ON RENT',
        summaryLine,
        primaryLabel: input.proposalBusy ? 'Sending…' : 'Request extension',
        primaryDisabled: input.proposalBusy,
        onPrimary: input.onRequestExtension,
        benchTone: 'active',
        contextLine: ctx,
        urgencyLine,
        secondaryAction: { label: 'Open messages', onPress: input.onOpenChat, disabled: false },
      };
    }

    return {
      stageLabel: 'ON RENT',
      summaryLine,
      primaryLabel: 'Coordinate return',
      primaryDisabled: false,
      onPrimary: input.onManageReturn,
      benchTone: 'active',
      contextLine: ctx,
      urgencyLine,
      secondaryAction: { label: 'Open messages', onPress: input.onOpenChat, disabled: false },
    };
  }

  if (input.workspaceStage === 'return') {
    if (input.viewerRole === 'owner' && input.returnReady && !input.returnCompleted) {
      return {
        stageLabel: 'RETURN',
        summaryLine:
          guide || 'The renter’s return looks complete — confirm condition to close out the rental.',
        primaryLabel: 'Confirm return',
        primaryDisabled: false,
        onPrimary: input.onConfirmReturn,
        benchTone: 'return',
        contextLine: ctx,
        secondaryAction: input.returnCompleted ? null : issueAction(input),
      };
    }
    const ownerReturnOpen =
      input.viewerRole === 'owner'
        ? guide ||
          (input.returnCompleted
            ? 'Return is recorded — photos and checklist below are read-only.'
            : 'Review return photos and the checklist, then confirm when the item matches what you expect.')
        : null;
    const renterReturnOpen =
      input.viewerRole === 'renter'
        ? guide ||
          (input.returnCompleted
            ? 'Return is recorded — your photos and checklist below are read-only.'
            : 'Upload return photos, finish your checklist, then confirm when drop-off is done.')
        : null;
    return {
      stageLabel: 'RETURN',
      summaryLine: input.viewerRole === 'owner' ? ownerReturnOpen! : renterReturnOpen!,
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
