export const DURATION_GRACE_HOURS = 4;

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
    ? `⚠ Duration changed from ${originalLabel} to ${proposedLabel}.`
    : null;
  return { warningTriggered, differenceHours, warningLine, originalLabel, proposedLabel };
}
