import { snapDateTimeToQuarterHour } from '@/lib/dateTimeScheduling';
import { resolveAcceptedRentalPickupIso } from '@/lib/rentalWizard/acceptedPickupCoordination';
import { resolveReturnMeetupAnchorIso } from '@/lib/rentalWizard/resolveReturnMeetupDefaults';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';

export type LockedMeetupSchedule = {
  /** Local calendar day for meetup coordination (`YYYY-MM-DD`). */
  dateYmd: string;
  /** Existing agreed/proposed datetime on the rental, if any. */
  anchorIso: string | null;
};

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function ymdFromIso(iso: string | null | undefined): string | null {
  const s = typeof iso === 'string' ? iso.trim() : '';
  if (!s) return null;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYmdLocal(ymd: string): Date | null {
  const m = YMD_RE.exec(ymd.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return new Date(y, mo - 1, d, 0, 0, 0, 0);
}

/** Human label for locked meetup day, e.g. "May 20". */
export function formatLockedMeetupDateLabel(ymd: string): string {
  const d = parseYmdLocal(ymd);
  if (!d) return ymd;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Time-only chip label, e.g. "5:00 PM". */
export function formatMeetupTimeLabel(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/**
 * Applies clock from `timeSource` onto `lockedYmd` (rental schedule day is fixed).
 * Rental extensions / schedule changes belong in a separate post-handoff flow — not here.
 */
export function applyTimeToLockedMeetupDate(
  lockedYmd: string,
  timeSource: Date | string
): string {
  const day = parseYmdLocal(lockedYmd);
  if (!day) {
    const src = typeof timeSource === 'string' ? new Date(Date.parse(timeSource)) : timeSource;
    return snapDateTimeToQuarterHour(src).toISOString();
  }
  const src =
    typeof timeSource === 'string' ? new Date(Date.parse(timeSource)) : new Date(timeSource.getTime());
  const out = new Date(day);
  out.setHours(src.getHours(), src.getMinutes(), 0, 0);
  return snapDateTimeToQuarterHour(out).toISOString();
}

function resolveLockedDateYmd(
  anchorIso: string | null,
  scheduleYmd: string | null | undefined
): string | null {
  return ymdFromIso(anchorIso) ?? (scheduleYmd?.trim() && YMD_RE.test(scheduleYmd.trim()) ? scheduleYmd.trim() : null);
}

export function resolveLockedPickupSchedule(ctx: RentalWizardContext): LockedMeetupSchedule {
  const anchorIso = ctx.pickupIso ?? resolveAcceptedRentalPickupIso(ctx.rental);
  const dateYmd =
    resolveLockedDateYmd(anchorIso, ctx.scheduleHints.rentalStartDate) ??
    ymdFromIso(new Date().toISOString())!;
  return { dateYmd, anchorIso };
}

export function resolveLockedReturnSchedule(ctx: RentalWizardContext): LockedMeetupSchedule {
  const anchorIso = resolveReturnMeetupAnchorIso(ctx) ?? ctx.returnIso;
  const dateYmd =
    resolveLockedDateYmd(anchorIso, ctx.scheduleHints.rentalEndDate) ??
    ymdFromIso(ctx.scheduleHints.returnIso) ??
    ymdFromIso(new Date().toISOString())!;
  return { dateYmd, anchorIso };
}

export function meetupDateHintForYmd(ymd: string): string {
  return `All times shown for ${formatLockedMeetupDateLabel(ymd)}`;
}
