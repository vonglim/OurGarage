/** Calendar-day strings `YYYY-MM-DD` in the device local calendar (no UTC shift for date-only math). */

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function isoDateFromLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseIsoDateLocal(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return new Date(NaN);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  return new Date(y, mo - 1, da);
}

export function compareIsoDate(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function addCalendarDays(iso: string, delta: number): string {
  const d = parseIsoDateLocal(iso);
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + delta);
  return isoDateFromLocalDate(d);
}

/** Inclusive calendar days in [start, end]. */
export function inclusiveDayCount(startIso: string, endIso: string): number {
  if (compareIsoDate(startIso, endIso) > 0) return 0;
  const s = parseIsoDateLocal(startIso).getTime();
  const e = parseIsoDateLocal(endIso).getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) return 0;
  const ms = 86400000;
  return Math.floor((e - s) / ms) + 1;
}

/** Inclusive range overlap on date-only strings. */
export function rangesOverlapInclusive(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return compareIsoDate(aStart, bEnd) <= 0 && compareIsoDate(bStart, aEnd) <= 0;
}

export function formatIsoDateMedium(iso: string): string {
  const d = parseIsoDateLocal(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function eachIsoDateInRange(startIso: string, endIso: string): string[] {
  if (compareIsoDate(startIso, endIso) > 0) return [];
  const out: string[] = [];
  let cur = startIso;
  while (compareIsoDate(cur, endIso) <= 0) {
    out.push(cur);
    cur = addCalendarDays(cur, 1);
  }
  return out;
}

export function startOfMonth(year: number, monthIndex0: number): string {
  return isoDateFromLocalDate(new Date(year, monthIndex0, 1));
}

export function monthLabel(year: number, monthIndex0: number): string {
  return new Date(year, monthIndex0, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}
