import { snapDateTimeToQuarterHour } from '@/lib/dateTimeScheduling';
import {
  applyTimeToLockedMeetupDate,
  formatMeetupTimeLabel,
  type LockedMeetupSchedule,
} from '@/lib/rentalWizard/coordinateMeetupSchedule';

export type CoordinateTimeSlot = {
  id: string;
  label: string;
  iso: string;
};

function parseAnchor(iso: string | null | undefined): Date | null {
  if (!iso?.trim()) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? snapDateTimeToQuarterHour(new Date(t)) : null;
}

function timeOnLockedDay(lockedYmd: string, hours: number, minutes: number): Date {
  const iso = applyTimeToLockedMeetupDate(
    lockedYmd,
    new Date(2000, 0, 1, hours, minutes, 0, 0)
  );
  return snapDateTimeToQuarterHour(new Date(Date.parse(iso)));
}

/**
 * Suggested meetup time chips — same agreed rental day only; labels are time-only.
 */
export function buildCoordinateTimeSlots(input: {
  lockedSchedule: LockedMeetupSchedule;
  ownerProposalIso?: string | null;
  selectedIso?: string | null;
}): CoordinateTimeSlot[] {
  const { lockedSchedule } = input;
  const lockedYmd = lockedSchedule.dateYmd;
  const seen = new Set<string>();
  const out: CoordinateTimeSlot[] = [];

  const push = (d: Date, id: string) => {
    const iso = applyTimeToLockedMeetupDate(lockedYmd, d);
    if (seen.has(iso)) return;
    seen.add(iso);
    out.push({
      id,
      label: formatMeetupTimeLabel(new Date(Date.parse(iso))),
      iso,
    });
  };

  const owner = parseAnchor(input.ownerProposalIso);
  if (owner) {
    push(new Date(Date.parse(applyTimeToLockedMeetupDate(lockedYmd, owner))), 'owner');
  }

  const anchor = parseAnchor(lockedSchedule.anchorIso);
  if (anchor) {
    const onLocked = new Date(Date.parse(applyTimeToLockedMeetupDate(lockedYmd, anchor)));
    push(onLocked, 'agreed');
  }

  push(timeOnLockedDay(lockedYmd, 10, 0), 'morning');
  push(timeOnLockedDay(lockedYmd, 14, 0), 'afternoon');
  push(timeOnLockedDay(lockedYmd, 17, 0), 'evening');

  const selected = parseAnchor(input.selectedIso);
  if (selected) {
    const iso = applyTimeToLockedMeetupDate(lockedYmd, selected);
    if (!seen.has(iso)) {
      out.unshift({
        id: 'selected',
        label: formatMeetupTimeLabel(new Date(Date.parse(iso))),
        iso,
      });
    }
  }

  return out.slice(0, 4);
}
