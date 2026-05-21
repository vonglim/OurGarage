/**
 * Pending meetup proposal values on the rental row (operational columns).
 * Used when ACCEPTING — not `agreed_*`, which may still hold the pre-negotiation baseline.
 */

function parseOperationalIso(raw: string | null | undefined): string | null {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s || !Number.isFinite(Date.parse(s))) return null;
  return s;
}

function sameInstant(a: string, b: string): boolean {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  return Number.isFinite(ta) && Number.isFinite(tb) && ta === tb;
}

export type ReconciledOperationalIso = {
  iso: string | null;
  source: 'pickup_datetime' | 'meetup_time' | 'return_datetime' | 'return_time' | 'none';
  conflict: boolean;
};

/** Canonical pickup operational read — `pickup_datetime` wins over legacy `meetup_time`. */
export function reconcileOperationalPickupIso(rental: {
  meetup_time?: string | null;
  pickup_datetime?: string | null;
}): ReconciledOperationalIso {
  const pickup = parseOperationalIso(rental.pickup_datetime);
  const meetup = parseOperationalIso(rental.meetup_time);
  if (pickup && meetup && !sameInstant(pickup, meetup)) {
    return { iso: pickup, source: 'pickup_datetime', conflict: true };
  }
  if (pickup) return { iso: pickup, source: 'pickup_datetime', conflict: false };
  if (meetup) return { iso: meetup, source: 'meetup_time', conflict: false };
  return { iso: null, source: 'none', conflict: false };
}

/** Canonical return operational read — `return_datetime` wins over legacy `return_time`. */
export function reconcileOperationalReturnIso(rental: {
  return_time?: string | null;
  return_datetime?: string | null;
}): ReconciledOperationalIso {
  const retDt = parseOperationalIso(rental.return_datetime);
  const retTime = parseOperationalIso(rental.return_time);
  if (retDt && retTime && !sameInstant(retDt, retTime)) {
    return { iso: retDt, source: 'return_datetime', conflict: true };
  }
  if (retDt) return { iso: retDt, source: 'return_datetime', conflict: false };
  if (retTime) return { iso: retTime, source: 'return_time', conflict: false };
  return { iso: null, source: 'none', conflict: false };
}

/** Operational pickup columns only — no `agreed_*` fallback (for pending UI display). */
export function resolveOperationalPickupIso(rental: {
  meetup_time?: string | null;
  pickup_datetime?: string | null;
}): string | null {
  return reconcileOperationalPickupIso(rental).iso;
}

/** Operational return columns only — no `agreed_*` fallback (for pending UI display). */
export function resolveOperationalReturnIso(rental: {
  return_time?: string | null;
  return_datetime?: string | null;
}): string | null {
  return reconcileOperationalReturnIso(rental).iso;
}

export function resolveProposedPickupIso(rental: {
  meetup_time?: string | null;
  pickup_datetime?: string | null;
  agreed_pickup_datetime?: string | null;
}): string | null {
  const operational = resolveOperationalPickupIso(rental);
  if (operational) return operational;
  const agreed = rental.agreed_pickup_datetime?.trim();
  if (agreed && Number.isFinite(Date.parse(agreed))) return agreed;
  return null;
}

export function resolveProposedReturnIso(rental: {
  return_time?: string | null;
  return_datetime?: string | null;
  agreed_return_datetime?: string | null;
}): string | null {
  const operational = resolveOperationalReturnIso(rental);
  if (operational) return operational;
  const agreed = rental.agreed_return_datetime?.trim();
  if (agreed && Number.isFinite(Date.parse(agreed))) return agreed;
  return null;
}

export function resolveProposedMeetupLocation(rental: {
  meetup_location?: string | null;
  return_location?: string | null;
}): string {
  return (rental.meetup_location ?? rental.return_location ?? '').trim();
}
