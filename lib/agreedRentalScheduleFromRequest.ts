import { tryParseFlexibleDateString } from '@/lib/requestSchedulePersistence';

/**
 * Derives persisted `agreed_pickup_datetime` / `agreed_return_datetime` from a request record.
 *
 * - Calendar-only fields (`YYYY-MM-DD`): pickup at 9:00 local, return at 17:00 local.
 * - Values with explicit date-time (e.g. ISO with time): use `Date.parse` as-is.
 */

const PICKUP_HOUR = 9;
const PICKUP_MINUTE = 0;
const RETURN_HOUR = 17;
const RETURN_MINUTE = 0;

function isYyyyMmDdOnly(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
}

function localWallClockToIso(y: number, month1: number, day: number, hour: number, minute: number): string {
  return new Date(y, month1 - 1, day, hour, minute, 0, 0).toISOString();
}

function yyyyMmDdToAgreedIso(yyyyMmDd: string, role: 'pickup' | 'return'): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(yyyyMmDd).trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (role === 'pickup') return localWallClockToIso(y, mo, d, PICKUP_HOUR, PICKUP_MINUTE);
  return localWallClockToIso(y, mo, d, RETURN_HOUR, RETURN_MINUTE);
}

function rawToAgreedIso(raw: string, role: 'pickup' | 'return'): string | null {
  const s = String(raw).trim();
  if (!s) return null;
  if (isYyyyMmDdOnly(s)) return yyyyMmDdToAgreedIso(s, role);
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

function toYyyyMmDd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function effectiveRentalDaySpan(row: Record<string, unknown>): number {
  const type = String(row.duration_type ?? row.durationType ?? '').toLowerCase();
  const v = Math.max(1, Math.round(Number(row.duration_value ?? row.durationValue) || 1));
  if (type === 'week' || type === 'weekly') return v * 7;
  return v;
}

/**
 * Resolved calendar pickup + return as `YYYY-MM-DD` (return may be derived from duration).
 */
function pickupAndReturnCalendarStrings(row: Record<string, unknown>): { p: string | null; r: string | null } {
  const beginFull = typeof row.beginAtIso === 'string' ? row.beginAtIso.trim() : '';
  let pCal: string | null = null;
  if (beginFull) {
    if (isYyyyMmDdOnly(beginFull)) pCal = beginFull;
    else {
      const t = Date.parse(beginFull);
      if (Number.isFinite(t)) pCal = toYyyyMmDd(new Date(t));
    }
  }
  if (!pCal) {
    const pd =
      (typeof row.pickupDate === 'string' && row.pickupDate.trim()) ||
      (typeof row.pickup_date === 'string' && row.pickup_date.trim()) ||
      '';
    if (pd) {
      pCal = tryParseFlexibleDateString(pd);
    }
  }

  const returnFull = typeof row.returnAtIso === 'string' ? row.returnAtIso.trim() : '';
  let rCal: string | null = null;
  if (returnFull) {
    if (isYyyyMmDdOnly(returnFull)) rCal = returnFull;
    else {
      const t = Date.parse(returnFull);
      if (Number.isFinite(t)) rCal = toYyyyMmDd(new Date(t));
    }
  }
  if (!rCal) {
    const rd =
      (typeof row.returnDate === 'string' && row.returnDate.trim()) ||
      (typeof row.return_date === 'string' && row.return_date.trim()) ||
      '';
    if (rd) {
      rCal = tryParseFlexibleDateString(rd);
    }
  }

  if (pCal && !rCal) {
    const span = effectiveRentalDaySpan(row);
    const anchor = yyyyMmDdToAgreedIso(pCal, 'pickup');
    if (anchor) {
      const start = new Date(anchor);
      const end = new Date(start.getTime() + span * 24 * 60 * 60 * 1000);
      rCal = toYyyyMmDd(end);
    }
  }

  return { p: pCal, r: rCal };
}

/**
 * ISO timestamps for `rentals.agreed_pickup_datetime` / `agreed_return_datetime`.
 */
export function agreedScheduleIsoPairFromRequest(requestLike: unknown): {
  pickupIso: string | null;
  returnIso: string | null;
} {
  if (!requestLike || typeof requestLike !== 'object') {
    return { pickupIso: null, returnIso: null };
  }
  const row = requestLike as Record<string, unknown>;
  const { p, r } = pickupAndReturnCalendarStrings(row);
  if (!p || !r) return { pickupIso: null, returnIso: null };

  const beginFull = typeof row.beginAtIso === 'string' ? row.beginAtIso.trim() : '';
  const returnFull = typeof row.returnAtIso === 'string' ? row.returnAtIso.trim() : '';

  const pickupIso =
    beginFull && !isYyyyMmDdOnly(beginFull)
      ? rawToAgreedIso(beginFull, 'pickup')
      : yyyyMmDdToAgreedIso(p, 'pickup');

  const returnIso =
    returnFull && !isYyyyMmDdOnly(returnFull)
      ? rawToAgreedIso(returnFull, 'return')
      : yyyyMmDdToAgreedIso(r, 'return');

  if (!pickupIso || !returnIso) return { pickupIso: null, returnIso: null };
  return { pickupIso, returnIso };
}
