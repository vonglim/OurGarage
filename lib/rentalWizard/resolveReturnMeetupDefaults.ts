import { mergeCalendarDayKeepingClock } from '@/lib/dateTimeScheduling';
import { resolveMeetupDisplaySchedule } from '@/lib/rentalMeetupDisplaySchedule';
import {
  resolveAcceptedMeetupLocation,
  resolveAcceptedRentalPickupIso,
} from '@/lib/rentalWizard/acceptedPickupCoordination';
import {
  applyTimeToLockedMeetupDate,
  ymdFromIso,
} from '@/lib/rentalWizard/coordinateMeetupSchedule';
import { resolveProposedReturnIso } from '@/lib/rentalWizard/proposedMeetupSchedule';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';
import {
  wizardHandoffFromNegotiation,
  type CoordinateReturnInheritedDefaults,
  type WizardHandoffMethod,
} from '@/lib/rentalWizard/wizardMeetupDraft';

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type ReturnMeetupDateSource =
  | 'agreed_return_datetime'
  | 'schedule_hint_return_iso'
  | 'rental_end_date'
  | 'accepted_return_proposal'
  | 'return_datetime'
  | 'return_time'
  | 'pickup_clock_on_return_end_day'
  | 'display_schedule_return'
  | 'none';

export type ResolvedReturnMeetupTime = {
  iso: string | null;
  source: ReturnMeetupDateSource;
};

function parseValidIso(raw: string | null | undefined): string | null {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s || !Number.isFinite(Date.parse(s))) return null;
  return s;
}

function rentalEndYmd(ctx: RentalWizardContext): string | null {
  const fromHint = ctx.scheduleHints.rentalEndDate?.trim();
  if (fromHint && YMD_RE.test(fromHint)) return fromHint;
  return ymdFromIso(ctx.scheduleHints.returnIso);
}

function rentalPickupYmd(ctx: RentalWizardContext): string | null {
  return ymdFromIso(ctx.pickupIso ?? resolveAcceptedRentalPickupIso(ctx.rental));
}

/** True when booking spans multiple calendar days (return day should not default to pickup day). */
export function rentalSpansMultipleCalendarDays(ctx: RentalWizardContext): boolean {
  const pickupYmd = rentalPickupYmd(ctx);
  const returnYmd = rentalEndYmd(ctx) ?? ymdFromIso(ctx.rental.agreed_return_datetime);
  if (!pickupYmd || !returnYmd) return false;
  return pickupYmd !== returnYmd;
}

/**
 * Operational return columns can mirror pickup meetup time during pickup-only proposals.
 * Skip them when they land on pickup day but the rental ends on a later day.
 */
function isOperationalReturnPollutedByPickupDay(ctx: RentalWizardContext, iso: string): boolean {
  if (!rentalSpansMultipleCalendarDays(ctx)) return false;
  const pickupYmd = rentalPickupYmd(ctx);
  const isoYmd = ymdFromIso(iso);
  return Boolean(pickupYmd && isoYmd && pickupYmd === isoYmd);
}

function isoFromRentalEndSchedule(ctx: RentalWizardContext): ResolvedReturnMeetupTime {
  if (ctx.scheduleHints.returnIso) {
    const iso = parseValidIso(ctx.scheduleHints.returnIso);
    if (iso) return { iso, source: 'schedule_hint_return_iso' };
  }

  const endYmd = rentalEndYmd(ctx);
  if (!endYmd) return { iso: null, source: 'none' };

  const pickupIso = resolveAcceptedRentalPickupIso(ctx.rental);
  if (pickupIso) {
    return {
      iso: applyTimeToLockedMeetupDate(endYmd, pickupIso),
      source: 'pickup_clock_on_return_end_day',
    };
  }

  const d = new Date(
    Number(endYmd.slice(0, 4)),
    Number(endYmd.slice(5, 7)) - 1,
    Number(endYmd.slice(8, 10)),
    17,
    0,
    0,
    0
  );
  return { iso: d.toISOString(), source: 'rental_end_date' };
}

/**
 * Canonical return meetup time for Coordinate Return (Screen 2).
 *
 * Priority:
 * 1. resolveMeetupDisplaySchedule return (operational vs agreed precedence)
 * 2. agreed_return_datetime
 * 3. rental end / schedule hint return ISO
 * 4. accepted return proposal (operational return_* when not pickup-day polluted)
 * 5. return_datetime / return_time (same guard)
 *
 * Never uses agreed_pickup_datetime or pickup meetup date as the return day anchor.
 */
export function resolveReturnMeetupTimeIso(ctx: RentalWizardContext): ResolvedReturnMeetupTime {
  const display = resolveMeetupDisplaySchedule({
    rental: ctx.rental,
    requestSchedulingMeta: ctx.requestSchedulingMeta,
    hasPendingProposal: ctx.hasPendingProposal,
  });
  if (display.returnIso && !isOperationalReturnPollutedByPickupDay(ctx, display.returnIso)) {
    return { iso: display.returnIso, source: 'display_schedule_return' };
  }

  const agreed = parseValidIso(ctx.rental.agreed_return_datetime);
  if (agreed && !isOperationalReturnPollutedByPickupDay(ctx, agreed)) {
    return { iso: agreed, source: 'agreed_return_datetime' };
  }

  const fromSchedule = isoFromRentalEndSchedule(ctx);
  if (fromSchedule.iso) return fromSchedule;

  const proposed = parseValidIso(resolveProposedReturnIso(ctx.rental));
  if (proposed && !isOperationalReturnPollutedByPickupDay(ctx, proposed)) {
    return { iso: proposed, source: 'accepted_return_proposal' };
  }

  for (const [key, source] of [
    ['return_datetime', 'return_datetime'],
    ['return_time', 'return_time'],
  ] as const) {
    const iso = parseValidIso(ctx.rental[key]);
    if (iso && !isOperationalReturnPollutedByPickupDay(ctx, iso)) {
      return { iso, source };
    }
  }

  return { iso: null, source: 'none' };
}

/** Anchor ISO for locking return meetup calendar day (time-only edits). */
export function resolveReturnMeetupAnchorIso(ctx: RentalWizardContext): string | null {
  return resolveReturnMeetupTimeIso(ctx).iso;
}

export function buildInheritedReturnDefaults(ctx: RentalWizardContext): CoordinateReturnInheritedDefaults {
  const method: WizardHandoffMethod = wizardHandoffFromNegotiation(ctx.agreedDeliveryMethod);
  const location =
    (ctx.rental.return_location ?? '').trim() || resolveAcceptedMeetupLocation(ctx.rental);
  const { iso: meetupTimeIso } = resolveReturnMeetupTimeIso(ctx);
  return { location, meetupTimeIso, method };
}

export function logReturnMeetupDefaults(ctx: RentalWizardContext, tag = 'coordinate_return'): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;

  const inherited = buildInheritedReturnDefaults(ctx);
  const resolved = resolveReturnMeetupTimeIso(ctx);

  console.log('[rental-return-defaults]', {
    tag,
    rentalId: ctx.rentalId,
    pickupIso: ctx.pickupIso ?? resolveAcceptedRentalPickupIso(ctx.rental),
    returnIso: ctx.returnIso,
    agreedReturnDatetime: ctx.rental.agreed_return_datetime ?? null,
    returnDatetime: ctx.rental.return_datetime ?? null,
    returnTime: ctx.rental.return_time ?? null,
    rentalEndDate: ctx.scheduleHints.rentalEndDate ?? null,
    scheduleHintReturnIso: ctx.scheduleHints.returnIso ?? null,
    inheritedReturnDefaults: inherited,
    resolvedReturnDateSource: resolved.source,
    resolvedReturnMeetupIso: resolved.iso,
    spansMultipleDays: rentalSpansMultipleCalendarDays(ctx),
  });
}

/** @deprecated Prefer resolveReturnMeetupTimeIso — kept for extension proposal helper alignment. */
export function mergeReturnOntoEndDateIfNeeded(
  ctx: RentalWizardContext,
  pickupIso: string
): string {
  const endYmd = rentalEndYmd(ctx);
  if (endYmd && YMD_RE.test(endYmd)) {
    return applyTimeToLockedMeetupDate(endYmd, pickupIso);
  }
  const pickup = new Date(pickupIso);
  if (Number.isFinite(pickup.getTime())) {
    return mergeCalendarDayKeepingClock(pickup, 1, pickup).toISOString();
  }
  return new Date(Date.now() + 86_400_000).toISOString();
}
