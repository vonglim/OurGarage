import { agreedScheduleIsoPairFromRequest } from '@/lib/agreedRentalScheduleFromRequest';

/** Inclusive calendar-day rental contract (billing / availability / extensions). */
export type ContractualRentalWindow = {
  contractualStartDate: string;
  contractualEndDate: string;
};

export type ContractualRentalWindowInput = {
  rentalStartDate?: string | null;
  rentalEndDate?: string | null;
  scheduleHints?: {
    rentalStartDate?: string | null;
    rentalEndDate?: string | null;
  } | null;
  /** `rental_requests`, `offers`, or legacy request row. */
  requestSchedulingMeta?: unknown;
};

export type ContractualMeetupProposalEvaluation = {
  contractualStartDate: string | null;
  contractualEndDate: string | null;
  proposedPickupDate: string | null;
  proposedReturnDate: string | null;
  isOperationalOnly: boolean;
  isExtensionRequest: boolean;
  extensionReason: string | null;
  warningTriggered: boolean;
  warningLine: string | null;
};

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeCalendarYmd(raw: string | null | undefined): string | null {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return null;
  if (YMD_RE.test(s)) return s;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  return toLocalYmd(d);
}

export function isoToLocalCalendarYmd(iso: string | null | undefined): string | null {
  const s = typeof iso === 'string' ? iso.trim() : '';
  if (!s) return null;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  return toLocalYmd(new Date(t));
}

function toLocalYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function compareCalendarYmd(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function calendarDatesFromRequestLike(requestLike: unknown): { start: string | null; end: string | null } {
  if (!requestLike || typeof requestLike !== 'object') {
    return { start: null, end: null };
  }
  const row = requestLike as Record<string, unknown>;
  const start =
    normalizeCalendarYmd(
      (typeof row.requested_start_date === 'string' && row.requested_start_date) ||
        (typeof row.rental_start_date === 'string' && row.rental_start_date) ||
        null
    ) ?? null;
  const end =
    normalizeCalendarYmd(
      (typeof row.requested_end_date === 'string' && row.requested_end_date) ||
        (typeof row.rental_end_date === 'string' && row.rental_end_date) ||
        null
    ) ?? null;
  if (start && end) return { start, end };

  const pair = agreedScheduleIsoPairFromRequest(row);
  return {
    start: start ?? (pair.pickupIso ? isoToLocalCalendarYmd(pair.pickupIso) : null),
    end: end ?? (pair.returnIso ? isoToLocalCalendarYmd(pair.returnIso) : null),
  };
}

/** Resolve hard contractual rental days — never from operational meetup columns. */
export function resolveContractualRentalWindow(
  input: ContractualRentalWindowInput
): ContractualRentalWindow | null {
  const fromHints = input.scheduleHints;
  const hintStart = normalizeCalendarYmd(fromHints?.rentalStartDate);
  const hintEnd = normalizeCalendarYmd(fromHints?.rentalEndDate);
  if (hintStart && hintEnd) {
    return { contractualStartDate: hintStart, contractualEndDate: hintEnd };
  }

  const explicitStart = normalizeCalendarYmd(input.rentalStartDate);
  const explicitEnd = normalizeCalendarYmd(input.rentalEndDate);
  if (explicitStart && explicitEnd) {
    return { contractualStartDate: explicitStart, contractualEndDate: explicitEnd };
  }

  const fromRequest = calendarDatesFromRequestLike(input.requestSchedulingMeta);
  if (fromRequest.start && fromRequest.end) {
    return { contractualStartDate: fromRequest.start, contractualEndDate: fromRequest.end };
  }

  return null;
}

/** Pickup meetup may fall anywhere on the contractual start calendar day. */
export function isWithinContractualPickupWindow(
  proposedPickupIso: string,
  contractualStartDate: string
): boolean {
  const proposed = isoToLocalCalendarYmd(proposedPickupIso);
  if (!proposed || !contractualStartDate) return false;
  return proposed === contractualStartDate;
}

/** Return meetup may fall anywhere on the contractual end calendar day (or earlier). */
export function isWithinContractualReturnWindow(
  proposedReturnIso: string,
  contractualEndDate: string
): boolean {
  const proposed = isoToLocalCalendarYmd(proposedReturnIso);
  if (!proposed || !contractualEndDate) return false;
  return compareCalendarYmd(proposed, contractualEndDate) <= 0;
}

/** True when pickup is before contract start or return is after contract end. */
export function isOutsideContractualRentalWindow(input: {
  proposedPickupIso: string;
  proposedReturnIso: string;
  window: ContractualRentalWindow;
}): boolean {
  const pickupDate = isoToLocalCalendarYmd(input.proposedPickupIso);
  const returnDate = isoToLocalCalendarYmd(input.proposedReturnIso);
  if (!pickupDate || !returnDate) return false;

  if (compareCalendarYmd(pickupDate, input.window.contractualStartDate) < 0) return true;
  if (compareCalendarYmd(returnDate, input.window.contractualEndDate) > 0) return true;
  return false;
}

function extensionReasonForProposal(input: {
  proposedPickupIso: string;
  proposedReturnIso: string;
  window: ContractualRentalWindow;
  phase?: 'pickup' | 'return' | 'extension' | 'general';
}): string | null {
  const pickupDate = isoToLocalCalendarYmd(input.proposedPickupIso);
  const returnDate = isoToLocalCalendarYmd(input.proposedReturnIso);
  if (!pickupDate || !returnDate) return null;

  if (input.phase !== 'return' && compareCalendarYmd(pickupDate, input.window.contractualStartDate) < 0) {
    return 'pickup_before_contract_start';
  }
  if (compareCalendarYmd(returnDate, input.window.contractualEndDate) > 0) {
    return 'return_after_contract_end';
  }
  return null;
}

function warningLineForExtensionReason(reason: string | null): string | null {
  if (reason === 'pickup_before_contract_start') {
    return 'You are proposing a pickup before the agreed rental start date. The other party must approve this change. Pricing and rental terms may change.';
  }
  if (reason === 'return_after_contract_end') {
    return 'You are proposing a return after the agreed rental end date. The other party must approve this extension. Pricing and late fees may change.';
  }
  return null;
}

/**
 * Canonical meetup proposal evaluation — contractual calendar boundaries only.
 * Never compares pickup↔return hour span as "rental duration".
 */
export function evaluateContractualMeetupProposal(input: {
  proposedPickupIso: string;
  proposedReturnIso: string;
  schedulingMeta?: unknown;
  scheduleHints?: ContractualRentalWindowInput['scheduleHints'];
  phase?: 'pickup' | 'return' | 'extension' | 'general';
  explicitExtension?: boolean;
}): ContractualMeetupProposalEvaluation {
  const window = resolveContractualRentalWindow({
    scheduleHints: input.scheduleHints,
    requestSchedulingMeta: input.schedulingMeta,
  });
  const proposedPickupDate = isoToLocalCalendarYmd(input.proposedPickupIso);
  const proposedReturnDate = isoToLocalCalendarYmd(input.proposedReturnIso);

  const base = {
    contractualStartDate: window?.contractualStartDate ?? null,
    contractualEndDate: window?.contractualEndDate ?? null,
    proposedPickupDate,
    proposedReturnDate,
  };

  if (input.phase === 'pickup') {
    const result: ContractualMeetupProposalEvaluation = {
      ...base,
      isOperationalOnly: true,
      isExtensionRequest: false,
      extensionReason: null,
      warningTriggered: false,
      warningLine: null,
    };
    logRentalContractWindow({ ...result, phase: input.phase });
    return result;
  }

  if (input.explicitExtension === true || input.phase === 'extension') {
    const result: ContractualMeetupProposalEvaluation = {
      ...base,
      isOperationalOnly: false,
      isExtensionRequest: true,
      extensionReason: 'explicit_extension_request',
      warningTriggered: true,
      warningLine: warningLineForExtensionReason('return_after_contract_end'),
    };
    logRentalContractWindow({ ...result, phase: input.phase ?? 'extension' });
    return result;
  }

  if (!window) {
    const result: ContractualMeetupProposalEvaluation = {
      ...base,
      isOperationalOnly: true,
      isExtensionRequest: false,
      extensionReason: null,
      warningTriggered: false,
      warningLine: null,
    };
    logRentalContractWindow({ ...result, phase: input.phase, note: 'no_contractual_window' });
    return result;
  }

  const extensionReason = extensionReasonForProposal({
    proposedPickupIso: input.proposedPickupIso,
    proposedReturnIso: input.proposedReturnIso,
    window,
    phase: input.phase,
  });
  const isExtensionRequest = extensionReason != null;
  const isOperationalOnly = !isExtensionRequest;

  const result: ContractualMeetupProposalEvaluation = {
    ...base,
    isOperationalOnly,
    isExtensionRequest,
    extensionReason,
    warningTriggered: isExtensionRequest,
    warningLine: warningLineForExtensionReason(extensionReason),
  };
  logRentalContractWindow({ ...result, phase: input.phase ?? 'general' });
  return result;
}

/** Pending/active rental proposal crosses beyond contractual return day. */
export function isMeetupProposalExtensionRequest(input: {
  proposedPickupIso: string | null | undefined;
  proposedReturnIso: string | null | undefined;
  schedulingMeta?: unknown;
  scheduleHints?: ContractualRentalWindowInput['scheduleHints'];
  explicitExtension?: boolean;
}): boolean {
  const pickup = typeof input.proposedPickupIso === 'string' ? input.proposedPickupIso.trim() : '';
  const ret = typeof input.proposedReturnIso === 'string' ? input.proposedReturnIso.trim() : '';
  if (!pickup || !ret) return input.explicitExtension === true;
  return evaluateContractualMeetupProposal({
    proposedPickupIso: pickup,
    proposedReturnIso: ret,
    schedulingMeta: input.schedulingMeta,
    scheduleHints: input.scheduleHints,
    explicitExtension: input.explicitExtension,
    phase: 'return',
  }).isExtensionRequest;
}

export function logRentalContractWindow(payload: Record<string, unknown>): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  console.log('[rental-contract-window]', payload);
}
