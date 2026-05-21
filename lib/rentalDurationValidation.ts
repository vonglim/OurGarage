import {
  evaluateContractualMeetupProposal,
  logRentalContractWindow,
  type ContractualMeetupProposalEvaluation,
} from '@/lib/rentalContractWindow';
import type { RentalScheduleBaselineLike } from '@/lib/proposalDurationChange';

export type MeetupProposalDurationTriggerSource =
  | 'pickup_coordination'
  | 'return_coordination'
  | 'extension'
  | 'general_meetup_proposal';

export type MeetupProposalDurationInput = {
  rental: RentalScheduleBaselineLike;
  requestSchedulingMeta?: unknown;
  scheduleHints?: {
    rentalStartDate?: string | null;
    rentalEndDate?: string | null;
  } | null;
  meetupTimeIso: string;
  returnTimeIso: string;
  isReturnOnly?: boolean;
  isExtension?: boolean;
  proposalMeta?: Record<string, unknown>;
};

export type MeetupProposalDurationEvaluation = {
  warningTriggered: boolean;
  differenceHours: number | null;
  warningLine: string | null;
  originalLabel: string | null;
  proposedLabel: string | null;
  triggerSource: MeetupProposalDurationTriggerSource;
  durationChangeDetected: boolean;
  reason: string;
  isOperationalOnly: boolean;
  isExtensionRequest: boolean;
  extensionReason: string | null;
};

export function resolveMeetupProposalTriggerSource(
  input: Pick<MeetupProposalDurationInput, 'isReturnOnly' | 'isExtension' | 'proposalMeta'>
): MeetupProposalDurationTriggerSource {
  if (input.isExtension === true || input.proposalMeta?.extension === true) {
    return 'extension';
  }
  if (input.isReturnOnly === true || input.proposalMeta?.phase === 'return') {
    return 'return_coordination';
  }
  if (input.proposalMeta?.phase === 'pickup') {
    return 'pickup_coordination';
  }
  return 'general_meetup_proposal';
}

function formatContractLabel(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  return `${start} → ${end}`;
}

function mapContractEvalToDurationEval(
  contractEval: ContractualMeetupProposalEvaluation,
  triggerSource: MeetupProposalDurationTriggerSource
): MeetupProposalDurationEvaluation {
  return {
    warningTriggered: contractEval.warningTriggered,
    differenceHours: null,
    warningLine: contractEval.warningLine,
    originalLabel: formatContractLabel(
      contractEval.contractualStartDate,
      contractEval.contractualEndDate
    ),
    proposedLabel: formatContractLabel(contractEval.proposedPickupDate, contractEval.proposedReturnDate),
    triggerSource,
    durationChangeDetected: contractEval.isExtensionRequest,
    reason: contractEval.extensionReason ?? (contractEval.isOperationalOnly ? 'operational_only' : 'unknown'),
    isOperationalOnly: contractEval.isOperationalOnly,
    isExtensionRequest: contractEval.isExtensionRequest,
    extensionReason: contractEval.extensionReason,
  };
}

/**
 * Contractual calendar-boundary warnings for meetup proposals.
 * Pickup coordination never triggers — only crossing rental start/end days.
 */
export function evaluateMeetupProposalDurationWarning(
  input: MeetupProposalDurationInput
): MeetupProposalDurationEvaluation {
  const triggerSource = resolveMeetupProposalTriggerSource(input);
  const phase =
    triggerSource === 'pickup_coordination'
      ? 'pickup'
      : triggerSource === 'return_coordination'
        ? 'return'
        : triggerSource === 'extension'
          ? 'extension'
          : 'general';

  const contractEval = evaluateContractualMeetupProposal({
    proposedPickupIso: input.meetupTimeIso,
    proposedReturnIso: input.returnTimeIso,
    schedulingMeta: input.requestSchedulingMeta,
    scheduleHints: input.scheduleHints,
    phase,
    explicitExtension: input.isExtension === true || input.proposalMeta?.extension === true,
  });

  const result = mapContractEvalToDurationEval(contractEval, triggerSource);
  logRentalDurationValidation({
    triggerSource,
    ...contractEval,
    durationChangeDetected: result.durationChangeDetected,
    reason: result.reason,
  });
  return result;
}

export function logRentalDurationValidation(payload: Record<string, unknown>): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  console.log('[rental-duration-validation]', payload);
}
