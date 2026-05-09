import { agreedScheduleIsoPairFromRequest } from '@/lib/agreedRentalScheduleFromRequest';

export const DURATION_GRACE_HOURS = 4;

export type RentalScheduleBaselineLike = {
  agreed_pickup_datetime?: string | null;
  agreed_return_datetime?: string | null;
  pickup_datetime?: string | null;
  meetup_time?: string | null;
  return_datetime?: string | null;
  return_time?: string | null;
} | null | undefined;

const MS_PER_HOUR = 60 * 60 * 1000;

function parseNumeric(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeDurationType(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase();
}

function parseDurationHoursFromText(raw: unknown): number | null {
  const text = String(raw ?? '').trim().toLowerCase();
  if (!text) return null;
  if (text === 'today' || text === 'full day') return 24;
  if (text === 'this weekend') return 72;
  const m = text.match(/(\d+(?:\.\d+)?)\s*(hour|hours|day|days|week|weeks)/i);
  if (!m) return null;
  const amount = Number(m[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = String(m[2]).toLowerCase();
  if (unit.startsWith('hour')) return amount;
  if (unit.startsWith('day')) return amount * 24;
  if (unit.startsWith('week')) return amount * 24 * 7;
  return null;
}

export function baselineDurationHoursFromRequest(requestLike: unknown): number | null {
  if (!requestLike || typeof requestLike !== 'object') return null;
  const row = requestLike as Record<string, unknown>;
  const fromSchedule = agreedScheduleIsoPairFromRequest(row);
  if (fromSchedule.pickupIso && fromSchedule.returnIso) {
    const spanHours = durationHoursBetween(fromSchedule.pickupIso, fromSchedule.returnIso);
    if (spanHours != null && Number.isFinite(spanHours) && spanHours > 0) return spanHours;
  }
  const type = normalizeDurationType(row.duration_type ?? row.durationType);
  const value = parseNumeric(row.duration_value ?? row.durationValue);

  if (type === 'week' || type === 'weekly') {
    if (value) return value * 24 * 7;
    return 24 * 7;
  }
  if (type === 'full' || type === 'fullday' || type === 'half' || type === 'day') {
    return value ? value * 24 : 24;
  }
  if (type === 'multiday' || type === 'multiple_days' || type === 'multipledays') {
    return value ? value * 24 : null;
  }

  if (value != null) return value * 24;
  return parseDurationHoursFromText(row.when ?? row.duration);
}

/**
 * Baseline rental duration for warnings: `agreed_*` columns first, then legacy operational
 * fields, then a one-time derivation from the request record.
 */
export function resolveAgreementBaselineDurationHours(
  rentalLike: RentalScheduleBaselineLike,
  requestLike: unknown
): number | null {
  const ap = String(rentalLike?.agreed_pickup_datetime ?? '').trim();
  const ar = String(rentalLike?.agreed_return_datetime ?? '').trim();
  if (ap !== '' && ar !== '') {
    const h = durationHoursBetween(ap, ar);
    if (h != null && Number.isFinite(h) && h > 0) return h;
  }
  const op = String(rentalLike?.pickup_datetime ?? rentalLike?.meetup_time ?? '').trim();
  const or = String(rentalLike?.return_datetime ?? rentalLike?.return_time ?? '').trim();
  if (op !== '' && or !== '') {
    const h = durationHoursBetween(op, or);
    if (h != null && Number.isFinite(h) && h > 0) return h;
  }
  const fromRequest = agreedScheduleIsoPairFromRequest(requestLike);
  if (fromRequest.pickupIso && fromRequest.returnIso) {
    const h = durationHoursBetween(fromRequest.pickupIso, fromRequest.returnIso);
    if (h != null && Number.isFinite(h) && h > 0) return h;
  }
  return baselineDurationHoursFromRequest(requestLike);
}

export function durationHoursBetween(startIso: string, endIso: string): number | null {
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return (endMs - startMs) / MS_PER_HOUR;
}

function formatDurationHours(hours: number): string {
  const roundedHours = Math.round(hours);
  if (roundedHours % 24 === 0) {
    const d = Math.max(1, Math.round(roundedHours / 24));
    return d === 1 ? '1 day' : `${d} days`;
  }
  if (roundedHours > 24) {
    const days = Math.floor(roundedHours / 24);
    const rem = roundedHours % 24;
    return rem > 0 ? `${days}d ${rem}h` : `${days}d`;
  }
  return roundedHours === 1 ? '1 hour' : `${roundedHours} hours`;
}

export function evaluateDurationChange(input: {
  baselineDurationHours: number | null;
  proposedDurationHours: number | null;
  graceHours?: number;
}): {
  warningTriggered: boolean;
  differenceHours: number | null;
  warningLine: string | null;
  originalLabel: string | null;
  proposedLabel: string | null;
} {
  const grace = Number.isFinite(input.graceHours) ? Math.max(0, Number(input.graceHours)) : DURATION_GRACE_HOURS;
  const baseline = input.baselineDurationHours;
  const proposed = input.proposedDurationHours;
  if (!Number.isFinite(baseline) || !Number.isFinite(proposed)) {
    return {
      warningTriggered: false,
      differenceHours: null,
      warningLine: null,
      originalLabel: null,
      proposedLabel: null,
    };
  }
  const baselineHours = Number(baseline);
  const proposedHours = Number(proposed);
  const differenceHours = proposedHours - baselineHours;
  const warningTriggered = Math.abs(differenceHours) > grace;
  const originalLabel = formatDurationHours(baselineHours);
  const proposedLabel = formatDurationHours(proposedHours);
  const warningLine = warningTriggered
    ? 'You are proposing a rental duration different from the original agreement. The other party must approve this change. Pricing and rental terms may change based on the updated duration.'
    : null;
  return { warningTriggered, differenceHours, warningLine, originalLabel, proposedLabel };
}
