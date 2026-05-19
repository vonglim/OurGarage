import { agreedScheduleIsoPairFromRequest } from '@/lib/agreedRentalScheduleFromRequest';
import {
  DURATION_GRACE_HOURS,
  durationHoursBetween,
  evaluateDurationChange,
  resolveAgreementBaselineDurationHours,
  type RentalScheduleBaselineLike,
} from '@/lib/proposalDurationChange';
import {
  isReturnExtensionProposal,
  resolveRentalPickupIso,
  resolveRentalReturnIso,
} from '@/lib/rentalExtensionProposal';

const MS_PER_HOUR = 60 * 60 * 1000;

export type MeetupProposalDurationTriggerSource =
  | 'pickup_coordination'
  | 'return_coordination'
  | 'extension'
  | 'general_meetup_proposal';

export type MeetupProposalDurationInput = {
  rental: RentalScheduleBaselineLike;
  requestSchedulingMeta?: unknown;
  meetupTimeIso: string;
  returnTimeIso: string;
  isReturnOnly?: boolean;
  isExtension?: boolean;
  proposalMeta?: Record<string, unknown>;
  graceHours?: number;
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
};

function parseIsoMs(iso: string | null | undefined): number | null {
  const s = typeof iso === 'string' ? iso.trim() : '';
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

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

function resolveBaselineReturnIso(
  rental: RentalScheduleBaselineLike,
  requestLike: unknown
): string | null {
  const agreed = rental?.agreed_return_datetime?.trim();
  if (agreed) return agreed;
  const operational = rental?.return_datetime?.trim() || rental?.return_time?.trim();
  if (operational) return operational;
  const fromRequest = agreedScheduleIsoPairFromRequest(requestLike);
  return fromRequest.returnIso;
}

function resolveRentalCalendarBounds(
  rental: RentalScheduleBaselineLike,
  requestLike: unknown
): { rentalStart: string | null; rentalEnd: string | null } {
  const pickup =
    rental?.agreed_pickup_datetime?.trim() ||
    resolveRentalPickupIso(rental ?? {}) ||
    agreedScheduleIsoPairFromRequest(requestLike).pickupIso;
  const ret = resolveBaselineReturnIso(rental, requestLike);
  return { rentalStart: pickup ?? null, rentalEnd: ret };
}

function evaluateReturnBoundaryExceeded(input: {
  baselineReturnIso: string;
  proposedReturnIso: string;
  baselinePickupIso: string | null;
  baselineDurationHours: number | null;
  graceHours: number;
}): MeetupProposalDurationEvaluation {
  const baseMs = parseIsoMs(input.baselineReturnIso);
  const propMs = parseIsoMs(input.proposedReturnIso);
  if (baseMs == null || propMs == null) {
    return {
      warningTriggered: false,
      differenceHours: null,
      warningLine: null,
      originalLabel: null,
      proposedLabel: null,
      triggerSource: 'return_coordination',
      durationChangeDetected: false,
      reason: 'return_boundary_unparseable',
    };
  }

  const differenceHours = (propMs - baseMs) / MS_PER_HOUR;
  const warningTriggered = differenceHours > input.graceHours;

  const proposedDurationHours =
    input.baselinePickupIso != null
      ? durationHoursBetween(input.baselinePickupIso, input.proposedReturnIso)
      : null;

  const durationEval =
    warningTriggered && input.baselineDurationHours != null && proposedDurationHours != null
      ? evaluateDurationChange({
          baselineDurationHours: input.baselineDurationHours,
          proposedDurationHours,
          graceHours: input.graceHours,
        })
      : null;

  return {
    warningTriggered,
    differenceHours,
    warningLine: warningTriggered
      ? 'You are proposing a return time after the agreed rental end. The other party must approve this change. Pricing and rental terms may change based on the updated duration.'
      : null,
    originalLabel: durationEval?.originalLabel ?? null,
    proposedLabel: durationEval?.proposedLabel ?? null,
    triggerSource: 'return_coordination',
    durationChangeDetected: warningTriggered,
    reason: warningTriggered ? 'return_exceeds_agreed_end' : 'return_within_agreed_window',
  };
}

/**
 * Contractual duration warnings for meetup proposals.
 * Pickup coordination never triggers — only return-boundary / extension flows.
 */
export function evaluateMeetupProposalDurationWarning(
  input: MeetupProposalDurationInput
): MeetupProposalDurationEvaluation {
  const grace = Number.isFinite(input.graceHours)
    ? Math.max(0, Number(input.graceHours))
    : DURATION_GRACE_HOURS;
  const triggerSource = resolveMeetupProposalTriggerSource(input);
  const { rentalStart, rentalEnd } = resolveRentalCalendarBounds(
    input.rental,
    input.requestSchedulingMeta
  );
  const baselineReturnIso = resolveBaselineReturnIso(input.rental, input.requestSchedulingMeta);
  const baselineDurationHours = resolveAgreementBaselineDurationHours(
    input.rental,
    input.requestSchedulingMeta
  );

  const logBase = {
    triggerSource,
    pickupIso: input.meetupTimeIso,
    returnIso: input.returnTimeIso,
    rentalStart,
    rentalEnd,
    baselineReturnIso,
    baselineDurationHours,
  };

  if (triggerSource === 'pickup_coordination') {
    const result: MeetupProposalDurationEvaluation = {
      warningTriggered: false,
      differenceHours: null,
      warningLine: null,
      originalLabel: null,
      proposedLabel: null,
      triggerSource,
      durationChangeDetected: false,
      reason: 'pickup_operational_only',
    };
    logRentalDurationValidation({ ...logBase, durationChangeDetected: false, reason: result.reason });
    return result;
  }

  const baselinePickupIso =
    input.rental?.agreed_pickup_datetime?.trim() ||
    resolveRentalPickupIso(input.rental ?? {}) ||
    input.meetupTimeIso;

  const extensionDetected =
    input.isExtension === true ||
    isReturnExtensionProposal({
      baselinePickupIso,
      baselineReturnIso,
      proposedPickupIso: input.meetupTimeIso,
      proposedReturnIso: input.returnTimeIso,
    });

  if (triggerSource === 'extension' || extensionDetected) {
    const proposedDurationHours = durationHoursBetween(input.meetupTimeIso, input.returnTimeIso);
    const durationEval = evaluateDurationChange({
      baselineDurationHours,
      proposedDurationHours,
      graceHours: grace,
    });
    const result: MeetupProposalDurationEvaluation = {
      warningTriggered: durationEval.warningTriggered,
      differenceHours: durationEval.differenceHours,
      warningLine: durationEval.warningLine,
      originalLabel: durationEval.originalLabel,
      proposedLabel: durationEval.proposedLabel,
      triggerSource: 'extension',
      durationChangeDetected: durationEval.warningTriggered,
      reason: durationEval.warningTriggered ? 'extension_duration_change' : 'extension_within_grace',
    };
    logRentalDurationValidation({
      ...logBase,
      durationChangeDetected: result.durationChangeDetected,
      reason: result.reason,
      extensionDetected,
    });
    return result;
  }

  if (baselineReturnIso) {
    const result = evaluateReturnBoundaryExceeded({
      baselineReturnIso,
      proposedReturnIso: input.returnTimeIso,
      baselinePickupIso,
      baselineDurationHours,
      graceHours: grace,
    });
    result.triggerSource =
      triggerSource === 'return_coordination' ? 'return_coordination' : 'general_meetup_proposal';
    logRentalDurationValidation({
      ...logBase,
      durationChangeDetected: result.durationChangeDetected,
      reason: result.reason,
    });
    return result;
  }

  const result: MeetupProposalDurationEvaluation = {
    warningTriggered: false,
    differenceHours: null,
    warningLine: null,
    originalLabel: null,
    proposedLabel: null,
    triggerSource,
    durationChangeDetected: false,
    reason: 'no_baseline_return',
  };
  logRentalDurationValidation({ ...logBase, durationChangeDetected: false, reason: result.reason });
  return result;
}

export function logRentalDurationValidation(payload: Record<string, unknown>): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  console.log('[rental-duration-validation]', payload);
}
