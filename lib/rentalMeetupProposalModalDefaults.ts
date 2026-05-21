import { calendarYmdToMeetupIso } from '@/lib/agreedRentalScheduleFromRequest';
import {
  isoToLocalCalendarYmd,
  resolveContractualRentalWindow,
  type ContractualRentalWindowInput,
} from '@/lib/rentalContractWindow';
import {
  resolveMeetupDisplaySchedule,
  type RentalMeetupRowLike,
} from '@/lib/rentalMeetupDisplaySchedule';
import { applyTimeToLockedMeetupDate } from '@/lib/rentalWizard/coordinateMeetupSchedule';

export type MeetupProposalModalSeedSource =
  | 'contractual_start_end'
  | 'contractual_dates_operational_times'
  | 'display_schedule'
  | 'pickup_plus_one_day'
  | 'now';

export type ResolvedMeetupProposalModalSeed = {
  pickupIso: string;
  returnIso: string;
  contractualStartDate: string | null;
  contractualEndDate: string | null;
  seededPickupDate: string | null;
  seededReturnDate: string | null;
  sourceUsed: MeetupProposalModalSeedSource;
  fallbackReason: string | null;
  operationalPickupIso: string | null;
  operationalReturnIso: string | null;
};

function parseValidIso(raw: string | null | undefined): string | null {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s || !Number.isFinite(Date.parse(s))) return null;
  return s;
}

function resolveOperationalTimeSources(
  rental: RentalMeetupRowLike,
  requestSchedulingMeta?: unknown,
  hasPendingProposal?: boolean
): { pickup: string | null; return: string | null } {
  const schedule = resolveMeetupDisplaySchedule({
    rental,
    requestSchedulingMeta,
    hasPendingProposal,
  });

  const pickup =
    parseValidIso(schedule.pendingPickupProposalIso) ??
    parseValidIso(schedule.acceptedPickupIso) ??
    parseValidIso(rental.pickup_datetime) ??
    parseValidIso(rental.meetup_time);

  const ret =
    parseValidIso(schedule.pendingReturnProposalIso) ??
    parseValidIso(schedule.acceptedReturnIso) ??
    parseValidIso(rental.return_datetime) ??
    parseValidIso(rental.return_time);

  return { pickup, return: ret };
}

function seedFromContractualWindow(input: {
  window: { contractualStartDate: string; contractualEndDate: string };
  operationalPickupIso: string | null;
  operationalReturnIso: string | null;
}): ResolvedMeetupProposalModalSeed {
  const { window, operationalPickupIso, operationalReturnIso } = input;
  const defaultPickup =
    calendarYmdToMeetupIso(window.contractualStartDate, 'pickup') ??
    new Date().toISOString();
  const defaultReturn =
    calendarYmdToMeetupIso(window.contractualEndDate, 'return') ??
    defaultPickup;

  const pickupIso = operationalPickupIso
    ? applyTimeToLockedMeetupDate(window.contractualStartDate, operationalPickupIso)
    : defaultPickup;
  const returnIso = operationalReturnIso
    ? applyTimeToLockedMeetupDate(window.contractualEndDate, operationalReturnIso)
    : defaultReturn;

  return {
    pickupIso,
    returnIso,
    contractualStartDate: window.contractualStartDate,
    contractualEndDate: window.contractualEndDate,
    seededPickupDate: isoToLocalCalendarYmd(pickupIso),
    seededReturnDate: isoToLocalCalendarYmd(returnIso),
    sourceUsed: operationalPickupIso || operationalReturnIso
      ? 'contractual_dates_operational_times'
      : 'contractual_start_end',
    fallbackReason: null,
    operationalPickupIso,
    operationalReturnIso,
  };
}

/**
 * Meetup proposal modal defaults — calendar days from contractual rental window only.
 * Operational/agreed ISOs supply editable clock times, never contractual calendar days.
 */
export function resolveMeetupProposalModalDefaults(input: {
  rental: RentalMeetupRowLike;
  requestSchedulingMeta?: unknown;
  scheduleHints?: ContractualRentalWindowInput['scheduleHints'];
  rentalStartDate?: string | null;
  rentalEndDate?: string | null;
  hasPendingProposal?: boolean;
}): ResolvedMeetupProposalModalSeed {
  const window = resolveContractualRentalWindow({
    rentalStartDate: input.rentalStartDate,
    rentalEndDate: input.rentalEndDate,
    scheduleHints: input.scheduleHints,
    requestSchedulingMeta: input.requestSchedulingMeta,
  });

  const { pickup: operationalPickupIso, return: operationalReturnIso } = resolveOperationalTimeSources(
    input.rental,
    input.requestSchedulingMeta,
    input.hasPendingProposal
  );

  if (window) {
    return seedFromContractualWindow({
      window,
      operationalPickupIso,
      operationalReturnIso,
    });
  }

  const schedule = resolveMeetupDisplaySchedule({
    rental: input.rental,
    requestSchedulingMeta: input.requestSchedulingMeta,
    hasPendingProposal: input.hasPendingProposal,
  });

  const pickupIso = parseValidIso(schedule.pickupIso);
  const returnIso = parseValidIso(schedule.returnIso);

  if (pickupIso && returnIso) {
    return {
      pickupIso,
      returnIso,
      contractualStartDate: null,
      contractualEndDate: null,
      seededPickupDate: isoToLocalCalendarYmd(pickupIso),
      seededReturnDate: isoToLocalCalendarYmd(returnIso),
      sourceUsed: 'display_schedule',
      fallbackReason: 'no_contractual_window',
      operationalPickupIso,
      operationalReturnIso,
    };
  }

  const now = new Date();
  const pickupFallback = pickupIso ?? now.toISOString();
  let returnFallback = returnIso;
  let sourceUsed: MeetupProposalModalSeedSource = 'now';
  let fallbackReason = 'no_contractual_window_and_no_display_schedule';

  if (pickupIso && !returnIso) {
    const pickupDate = new Date(pickupIso);
    returnFallback = new Date(pickupDate.getTime() + 86_400_000).toISOString();
    sourceUsed = 'pickup_plus_one_day';
    fallbackReason = 'return_missing_used_pickup_plus_one_day';
  } else if (!pickupIso && !returnIso) {
    returnFallback = new Date(now.getTime() + 86_400_000).toISOString();
  } else {
    returnFallback = returnFallback ?? new Date(now.getTime() + 86_400_000).toISOString();
  }

  return {
    pickupIso: pickupFallback,
    returnIso: returnFallback,
    contractualStartDate: null,
    contractualEndDate: null,
    seededPickupDate: isoToLocalCalendarYmd(pickupFallback),
    seededReturnDate: isoToLocalCalendarYmd(returnFallback),
    sourceUsed,
    fallbackReason,
    operationalPickupIso,
    operationalReturnIso,
  };
}

export function logRentalOwnerMeetupDefaults(
  rentalId: string,
  seed: ResolvedMeetupProposalModalSeed,
  extra?: { surface?: string; isOwner?: boolean }
): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;

  console.log('[rental-owner-meetup-defaults]', {
    rentalId,
    surface: extra?.surface ?? 'meetup_proposal_modal',
    isOwner: extra?.isOwner ?? null,
    contractualStartDate: seed.contractualStartDate,
    contractualEndDate: seed.contractualEndDate,
    seededPickupDate: seed.seededPickupDate,
    seededReturnDate: seed.seededReturnDate,
    sourceUsed: seed.sourceUsed,
    fallbackReason: seed.fallbackReason,
    pickupIso: seed.pickupIso,
    returnIso: seed.returnIso,
    operationalPickupIso: seed.operationalPickupIso,
    operationalReturnIso: seed.operationalReturnIso,
  });
}
