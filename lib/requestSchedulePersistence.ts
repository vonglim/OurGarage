/**
 * Canonical rental calendar fields for requests: always persist YYYY-MM-DD plus
 * optional wall-clock anchors (9:00 local pickup, 17:00 local return) as ISO strings.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const PICKUP_HOUR = 9;
const PICKUP_MINUTE = 0;
const RETURN_HOUR = 17;
const RETURN_MINUTE = 0;

export function calendarDateToYyyyMmDd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function localWallClockToIso(y: number, month1: number, day: number, hour: number, minute: number): string {
  return new Date(y, month1 - 1, day, hour, minute, 0, 0).toISOString();
}

/** Parse MM/DD/YYYY (masked input) to local calendar Date at midnight. */
export function parseUsMaskedDateToLocal(value: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!m) return null;
  const mm = Number(m[1]);
  const dd = Number(m[2]);
  const yyyy = Number(m[3]);
  if (!Number.isFinite(mm) || !Number.isFinite(dd) || !Number.isFinite(yyyy)) return null;
  const d = new Date(yyyy, mm - 1, dd);
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function isYyyyMmDdOnly(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
}

/**
 * Normalize arbitrary stored date strings to YYYY-MM-DD (local calendar).
 * Supports YYYY-MM-DD, MM/DD/YYYY, and other strings `Date.parse` handles.
 */
export function tryParseFlexibleDateString(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (isYyyyMmDdOnly(s)) return s;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m) {
    const mm = Number(m[1]);
    const dd = Number(m[2]);
    const yyyy = Number(m[3]);
    const d = new Date(yyyy, mm - 1, dd);
    if (d.getFullYear() === yyyy && d.getMonth() === mm - 1 && d.getDate() === dd) {
      return calendarDateToYyyyMmDd(d);
    }
    return null;
  }
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  return calendarDateToYyyyMmDd(d);
}

function yyyyMmDdToLocalDate(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

function calendarYmdCompare(a: string, b: string): number {
  const da = yyyyMmDdToLocalDate(a);
  const db = yyyyMmDdToLocalDate(b);
  if (!da || !db) return 0;
  return da.getTime() - db.getTime();
}

export function validateCalendarReturnAfterPickup(pickupYmd: string, returnYmd: string): string | null {
  if (calendarYmdCompare(returnYmd, pickupYmd) <= 0) {
    return 'Return date must be after pickup date.';
  }
  return null;
}

export function persistedScheduleFromCalendarDates(
  pickupLocalMidnight: Date,
  returnLocalMidnight: Date
): { pickupDate: string; returnDate: string; beginAtIso: string; returnAtIso: string } {
  const pickupDate = calendarDateToYyyyMmDd(pickupLocalMidnight);
  const returnDate = calendarDateToYyyyMmDd(returnLocalMidnight);
  const py = pickupLocalMidnight.getFullYear();
  const pm = pickupLocalMidnight.getMonth() + 1;
  const pd = pickupLocalMidnight.getDate();
  const ry = returnLocalMidnight.getFullYear();
  const rm = returnLocalMidnight.getMonth() + 1;
  const rd = returnLocalMidnight.getDate();
  return {
    pickupDate,
    returnDate,
    beginAtIso: localWallClockToIso(py, pm, pd, PICKUP_HOUR, PICKUP_MINUTE),
    returnAtIso: localWallClockToIso(ry, rm, rd, RETURN_HOUR, RETURN_MINUTE),
  };
}

/** Mask MM/DD/YYYY for the request form from YYYY-MM-DD or pass-through if already masked. */
export function formatStoredDateForRequestForm(raw: string): string {
  const s = String(raw).trim();
  if (!s) return '';
  if (isYyyyMmDdOnly(s)) {
    const d = yyyyMmDdToLocalDate(s);
    if (!d) return s;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    return `${mm}/${dd}/${yyyy}`;
  }
  return s;
}

function effectiveRentalDaySpan(durationType: string | undefined, durationValue: number | null | undefined): number {
  const type = String(durationType ?? '').toLowerCase();
  const v = Math.max(1, Math.round(Number(durationValue) || 1));
  if (type === 'week' || type === 'weekly') return v * 7;
  return v;
}

function strField(row: Record<string, unknown>, camel: string, snake: string): string | null {
  const a = row[camel];
  const b = row[snake];
  const s =
    typeof a === 'string' && a.trim() !== ''
      ? a.trim()
      : typeof b === 'string' && b.trim() !== ''
        ? b.trim()
        : '';
  return s !== '' ? s : null;
}

/**
 * Resolves canonical schedule fields from a store row, payload, or legacy shapes (snake_case, `when` only).
 * Used immediately before Supabase insert/update so the description JSON always gets a full schedule.
 */
export function resolveScheduleFieldsForPersistence(row: Record<string, unknown>): {
  pickupDate: string | null;
  returnDate: string | null;
  beginAtIso: string | null;
  returnAtIso: string | null;
} {
  const durationType =
    typeof row.durationType === 'string'
      ? row.durationType
      : typeof row.duration_type === 'string'
        ? row.duration_type
        : undefined;
  const durationValue =
    typeof row.durationValue === 'number' && Number.isFinite(row.durationValue)
      ? row.durationValue
      : typeof row.duration_value === 'number' && Number.isFinite(row.duration_value)
        ? row.duration_value
        : null;

  let pickupDate: string | null = null;
  const pickupRaw = strField(row, 'pickupDate', 'pickup_date');
  if (pickupRaw) pickupDate = tryParseFlexibleDateString(pickupRaw);
  if (!pickupDate) {
    const b = strField(row, 'beginAtIso', 'begin_at_iso');
    if (b) {
      pickupDate = tryParseFlexibleDateString(b.slice(0, 10)) ?? tryParseFlexibleDateString(b);
    }
  }
  if (!pickupDate) {
    const w = typeof row.when === 'string' && row.when.trim() !== '' ? row.when.trim() : null;
    if (w) pickupDate = tryParseFlexibleDateString(w);
  }

  let returnDate: string | null = null;
  const returnRaw = strField(row, 'returnDate', 'return_date');
  if (returnRaw) returnDate = tryParseFlexibleDateString(returnRaw);
  if (!returnDate) {
    const r = strField(row, 'returnAtIso', 'return_at_iso');
    if (r) {
      returnDate = tryParseFlexibleDateString(r.slice(0, 10)) ?? tryParseFlexibleDateString(r);
    }
  }

  let beginAtIso = strField(row, 'beginAtIso', 'begin_at_iso');
  let returnAtIso = strField(row, 'returnAtIso', 'return_at_iso');

  if (pickupDate && !returnDate) {
    const span = effectiveRentalDaySpan(durationType, durationValue);
    const start = yyyyMmDdToLocalDate(pickupDate);
    if (start) {
      returnDate = calendarDateToYyyyMmDd(new Date(start.getTime() + span * MS_PER_DAY));
    }
  }

  if (!pickupDate && returnDate) {
    const span = effectiveRentalDaySpan(durationType, durationValue);
    const end = yyyyMmDdToLocalDate(returnDate);
    if (end) {
      pickupDate = calendarDateToYyyyMmDd(new Date(end.getTime() - span * MS_PER_DAY));
    }
  }

  if (pickupDate && returnDate && (!beginAtIso || !returnAtIso)) {
    const pd = yyyyMmDdToLocalDate(pickupDate);
    const rd = yyyyMmDdToLocalDate(returnDate);
    if (pd && rd) {
      const sched = persistedScheduleFromCalendarDates(pd, rd);
      beginAtIso = beginAtIso ?? sched.beginAtIso;
      returnAtIso = returnAtIso ?? sched.returnAtIso;
    }
  }

  return { pickupDate, returnDate, beginAtIso, returnAtIso };
}

/**
 * Hydration repair: coerce legacy / partial JSON into canonical schedule fields.
 * New writes always include real dates; this helps older rows and duration-only gaps.
 */
export function normalizeDecodedRequestScheduleFields(raw: Record<string, unknown>): Record<string, unknown> {
  let pickupDate =
    typeof raw.pickupDate === 'string' ? tryParseFlexibleDateString(raw.pickupDate) : null;
  let returnDate =
    typeof raw.returnDate === 'string' ? tryParseFlexibleDateString(raw.returnDate) : null;
  let beginAtIso = typeof raw.beginAtIso === 'string' ? raw.beginAtIso.trim() : null;
  let returnAtIso = typeof raw.returnAtIso === 'string' ? raw.returnAtIso.trim() : null;

  if (!pickupDate && beginAtIso) {
    pickupDate = tryParseFlexibleDateString(beginAtIso.slice(0, 10)) ?? tryParseFlexibleDateString(beginAtIso);
  }
  if (!returnDate && returnAtIso) {
    returnDate = tryParseFlexibleDateString(returnAtIso.slice(0, 10)) ?? tryParseFlexibleDateString(returnAtIso);
  }

  if (pickupDate && !returnDate) {
    const span = effectiveRentalDaySpan(
      typeof raw.durationType === 'string' ? raw.durationType : undefined,
      typeof raw.durationValue === 'number' ? raw.durationValue : null
    );
    const start = yyyyMmDdToLocalDate(pickupDate);
    if (start) {
      const end = new Date(start.getTime() + span * MS_PER_DAY);
      returnDate = calendarDateToYyyyMmDd(end);
    }
  }

  if (!pickupDate && returnDate) {
    const span = effectiveRentalDaySpan(
      typeof raw.durationType === 'string' ? raw.durationType : undefined,
      typeof raw.durationValue === 'number' ? raw.durationValue : null
    );
    const end = yyyyMmDdToLocalDate(returnDate);
    if (end) {
      const start = new Date(end.getTime() - span * MS_PER_DAY);
      pickupDate = calendarDateToYyyyMmDd(start);
    }
  }

  if (pickupDate && returnDate && (!beginAtIso || !returnAtIso)) {
    const pd = yyyyMmDdToLocalDate(pickupDate);
    const rd = yyyyMmDdToLocalDate(returnDate);
    if (pd && rd) {
      const { beginAtIso: b, returnAtIso: r } = persistedScheduleFromCalendarDates(pd, rd);
      beginAtIso = beginAtIso ?? b;
      returnAtIso = returnAtIso ?? r;
    }
  }

  return {
    ...raw,
    pickupDate,
    returnDate,
    beginAtIso,
    returnAtIso,
  };
}

export function validateRequestPayloadSchedule(p: {
  pickupDate?: string | null;
  returnDate?: string | null;
}): string | null {
  const pick = (p.pickupDate ?? '').trim();
  const ret = (p.returnDate ?? '').trim();
  if (!pick || !ret) {
    return 'Pickup and return dates are required.';
  }
  if (!isYyyyMmDdOnly(pick) || !isYyyyMmDdOnly(ret)) {
    return 'Pickup and return must use calendar dates (YYYY-MM-DD).';
  }
  return validateCalendarReturnAfterPickup(pick, ret);
}

export function logRequestScheduleDebug(context: string, row: Record<string, unknown>): void {
  if (!__DEV__) return;
  console.log(`[request schedule] ${context}`, {
    pickupDate: row.pickupDate,
    returnDate: row.returnDate,
    beginAtIso: row.beginAtIso,
    returnAtIso: row.returnAtIso,
    durationValue: row.durationValue,
    durationType: row.durationType,
  });
}
