/** Helpers for rental return extensions via meetup proposal infrastructure. */

const MS_PER_DAY = 86_400_000;

export function addCalendarDaysToIso(iso: string, days: number): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t) || days < 0) return null;
  return new Date(t + days * MS_PER_DAY).toISOString();
}

export function resolveRentalPickupIso(rental: {
  pickup_datetime?: string | null;
  meetup_time?: string | null;
  agreed_pickup_datetime?: string | null;
}): string | null {
  for (const k of ['agreed_pickup_datetime', 'pickup_datetime', 'meetup_time'] as const) {
    const v = rental[k];
    if (typeof v === 'string' && v.trim() !== '') {
      const t = Date.parse(v);
      if (Number.isFinite(t)) return v.trim();
    }
  }
  return null;
}

export function resolveRentalReturnIso(rental: {
  return_datetime?: string | null;
  return_time?: string | null;
  agreed_return_datetime?: string | null;
}): string | null {
  for (const k of ['return_datetime', 'return_time', 'agreed_return_datetime'] as const) {
    const v = rental[k];
    if (typeof v === 'string' && v.trim() !== '') {
      const t = Date.parse(v);
      if (Number.isFinite(t)) return v.trim();
    }
  }
  return null;
}

export function buildExtensionReturnIso(currentReturnIso: string, extraDays: number): string | null {
  if (extraDays <= 0) return null;
  return addCalendarDaysToIso(currentReturnIso, extraDays);
}

/** Extension = return moves later while pickup stays within 4h of baseline pickup. */
export function isReturnExtensionProposal(input: {
  baselinePickupIso: string | null;
  baselineReturnIso: string | null;
  proposedPickupIso: string;
  proposedReturnIso: string;
}): boolean {
  const baseRet = input.baselineReturnIso ? Date.parse(input.baselineReturnIso) : NaN;
  const propRet = Date.parse(input.proposedReturnIso);
  if (!Number.isFinite(baseRet) || !Number.isFinite(propRet) || propRet <= baseRet) return false;

  const basePick = input.baselinePickupIso ? Date.parse(input.baselinePickupIso) : NaN;
  const propPick = Date.parse(input.proposedPickupIso);
  if (!Number.isFinite(basePick) || !Number.isFinite(propPick)) return propRet > baseRet;
  return Math.abs(propPick - basePick) <= 4 * 60 * 60 * 1000;
}
