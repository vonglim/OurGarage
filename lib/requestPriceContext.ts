import type { DurationType } from './durationFormat';
import { formatUsd } from './money';

/**
 * Billable "day" count for dividing a total into a per-day figure (same basis for listed vs offer).
 */
export function billingDayCountForRequest(req: {
  durationType?: DurationType | string | null | undefined;
  durationValue?: number | null | undefined;
}): number {
  const t = req.durationType;
  const dv =
    typeof req.durationValue === 'number' && Number.isFinite(req.durationValue) && req.durationValue >= 1
      ? Math.floor(req.durationValue)
      : 1;
  if (t === 'halfDay') return 0.5;
  if (t === 'fullDay') return 1;
  if (t === 'weekly') return dv * 7;
  return dv;
}

export function perDayFromTotal(total: number, dayCount: number): number | null {
  if (!Number.isFinite(total) || total < 0) return null;
  if (!Number.isFinite(dayCount) || dayCount <= 0) return null;
  return total / dayCount;
}

export function formatPerDayUsd(total: number, dayCount: number): string {
  const per = perDayFromTotal(total, dayCount);
  if (per == null) return '—';
  return `${formatUsd(per)}/day`;
}

/** Opening suggestion: lower than list (simple % of total), min $1. */
export function suggestedOfferTotalFromListed(listedTotal: number): number {
  if (!Number.isFinite(listedTotal) || listedTotal <= 0) return 0;
  const raw = listedTotal * 0.55;
  return Math.max(1, Math.round(raw * 100) / 100);
}
