import { snapDateTimeToQuarterHour } from '@/lib/dateTimeScheduling';

export type CoordinateTimeSlot = {
  id: string;
  label: string;
  iso: string;
};

function formatSlotLabel(d: Date): string {
  return d.toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function addHours(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

function parseAnchor(iso: string | null | undefined): Date | null {
  if (!iso?.trim()) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? snapDateTimeToQuarterHour(new Date(t)) : null;
}

/**
 * Suggested meetup chips for the coordinate wizard — owner proposal, rental start, nearby times.
 */
export function buildCoordinateTimeSlots(input: {
  ownerProposalIso?: string | null;
  rentalStartDate?: string | null;
  selectedIso?: string | null;
}): CoordinateTimeSlot[] {
  const seen = new Set<string>();
  const out: CoordinateTimeSlot[] = [];

  const push = (d: Date, id: string) => {
    const iso = snapDateTimeToQuarterHour(d).toISOString();
    if (seen.has(iso)) return;
    seen.add(iso);
    out.push({ id, label: formatSlotLabel(d), iso });
  };

  const owner = parseAnchor(input.ownerProposalIso);
  if (owner) push(owner, 'owner');

  const startDate = input.rentalStartDate?.trim();
  if (startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const day = Number(m[3]);
      push(new Date(y, mo - 1, day, 17, 0, 0, 0), 'start-evening');
      push(new Date(y, mo - 1, day, 10, 0, 0, 0), 'start-morning');
    }
  }

  const base = owner ?? new Date();
  const friday = new Date(base);
  while (friday.getDay() !== 5) friday.setDate(friday.getDate() + 1);
  friday.setHours(17, 0, 0, 0);
  push(friday, 'fri-5');

  const saturday = new Date(friday);
  saturday.setDate(saturday.getDate() + 1);
  saturday.setHours(10, 0, 0, 0);
  push(saturday, 'sat-10');

  if (out.length < 3) {
    push(addHours(base, 2), 'near-2h');
    push(addHours(base, 24), 'near-24h');
  }

  const selected = parseAnchor(input.selectedIso);
  if (selected) {
    const iso = selected.toISOString();
    if (!seen.has(iso)) {
      out.unshift({ id: 'selected', label: formatSlotLabel(selected), iso });
    }
  }

  return out.slice(0, 5);
}
