import { eachIsoDateInRange } from '@/lib/listingAvailabilityDates';
import { PROFILE_NAME_FALLBACK } from '@/lib/profileConstants';
import type { NegotiationDeliveryMethod } from '@/lib/negotiationDelivery';
import type { RentalWizardContext } from '@/lib/rentalWizard/types';

/** Short owner label for inline emphasis, e.g. "Test U." */
export function formatOwnerShortLabel(displayName: string): string {
  const n = displayName.trim();
  if (!n || n === PROFILE_NAME_FALLBACK) return 'the owner';
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0];
    const lastInitial = parts[parts.length - 1]![0]?.toUpperCase();
    if (lastInitial) return `${first} ${lastInitial}.`;
  }
  return n;
}

function formatYmdShort(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return ymd;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(dt.getTime())) return ymd;
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function rentalDayCount(start: string, end: string): number {
  const days = eachIsoDateInRange(start, end);
  return days.length > 0 ? days.length : 1;
}

export function formatAgreedHandoffLabel(method: NegotiationDeliveryMethod): string {
  return method === 'owner_delivery' ? 'Owner delivery' : 'Pickup';
}

export type HandoffSummaryCopy = {
  title: string;
  subtitle: string;
  icon: 'location-outline' | 'car-outline';
};

export function formatHandoffSummaryCopy(method: NegotiationDeliveryMethod): HandoffSummaryCopy {
  if (method === 'owner_delivery') {
    return { title: 'Delivery', subtitle: 'Delivered by owner', icon: 'car-outline' };
  }
  return { title: 'Pickup', subtitle: 'Meet in person', icon: 'location-outline' };
}

export type RentalConfirmedSummaryDisplay = {
  ownerShort: string;
  dateRange: string;
  durationDays: string;
  handoffTitle: string;
  handoffSubtitle: string;
  handoffIcon: HandoffSummaryCopy['icon'];
};

export function buildRentalConfirmedSummaryDisplay(
  ctx: RentalWizardContext
): RentalConfirmedSummaryDisplay {
  const start =
    ctx.scheduleHints.rentalStartDate?.trim() ||
    (ctx.pickupIso ? ctx.pickupIso.slice(0, 10) : null);
  const end =
    ctx.scheduleHints.rentalEndDate?.trim() ||
    (ctx.returnIso ? ctx.returnIso.slice(0, 10) : null);

  let dateRange = 'Dates to be confirmed';
  let durationDays = '';
  const handoff = formatHandoffSummaryCopy(ctx.agreedDeliveryMethod);
  if (start && end && /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end)) {
    const a = formatYmdShort(start);
    const b = formatYmdShort(end);
    dateRange = a === b ? a : `${a} – ${b}`;
    const count = rentalDayCount(start, end);
    durationDays = `${count} day${count === 1 ? '' : 's'}`;
  } else if (start && /^\d{4}-\d{2}-\d{2}$/.test(start)) {
    dateRange = formatYmdShort(start);
  }

  return {
    ownerShort: formatOwnerShortLabel(ctx.ownerDisplayName),
    dateRange,
    durationDays,
    handoffTitle: handoff.title,
    handoffSubtitle: handoff.subtitle,
    handoffIcon: handoff.icon,
  };
}
