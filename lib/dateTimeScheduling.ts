/**
 * Scheduling helpers — quarter-hour time steps and pickup/return day alignment.
 * Used wherever rental meetup pickup/return dates are drafted in the picker flow.
 */

/** Matches `MinuteInterval` from @react-native-community/datetimepicker. */
export const SCHEDULING_QUARTER_HOUR_INTERVAL = 15 as const;

function startOfLocalCalendarDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function calendarDaysEqualLocal(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Rounds local wall time to the nearest quarter hour; rollovers (e.g. past midnight)
 * use normal JS `Date` arithmetic.
 */
export function snapDateTimeToQuarterHour(d: Date): Date {
  const t = d.getTime();
  if (!Number.isFinite(t)) return d;
  const sod = startOfLocalCalendarDay(d).getTime();
  const minsFromMidnight = (t - sod) / 60000;
  const snappedMinutes =
    Math.round(minsFromMidnight / SCHEDULING_QUARTER_HOUR_INTERVAL) *
    SCHEDULING_QUARTER_HOUR_INTERVAL;
  return new Date(sod + snappedMinutes * 60000);
}

/**
 * Calendar box for `pickup` + `days`, at the clock from `timeSource`
 * (hour/minute derived from `timeSource`, quarter-snapped).
 */
export function mergeCalendarDayKeepingClock(pickup: Date, days: number, timeSource: Date): Date {
  const anchor = startOfLocalCalendarDay(pickup);
  anchor.setDate(anchor.getDate() + days);
  const out = new Date(timeSource);
  out.setFullYear(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  return snapDateTimeToQuarterHour(out);
}

/** True when return falls on pickup's local calendar day + 1 (default next-day rental). */
export function isReturnDefaultNextCalendarDayAfterPickup(pickup: Date, ret: Date): boolean {
  const expected = startOfLocalCalendarDay(pickup);
  expected.setDate(expected.getDate() + 1);
  return calendarDaysEqualLocal(ret, expected);
}
