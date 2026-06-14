import { getAuthUserIdSync } from '@/lib/authUser';
import {
  addCalendarDays,
  compareIsoDate,
  inclusiveDayCount,
  isoDateFromLocalDate,
  rangesOverlapInclusive,
} from '@/lib/listingAvailabilityDates';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export type ListingAvailabilityType = 'blocked' | 'pending' | 'booked';

export type ListingAvailabilityRow = {
  id: string;
  listingId: string;
  startDate: string;
  endDate: string;
  availabilityType: ListingAvailabilityType;
  sourceOfferId: string | null;
  sourceRequestId: string | null;
  createdByUserId: string | null;
  createdAt: string;
};

export type ListingAvailabilityBuckets = {
  all: ListingAvailabilityRow[];
  blocked: ListingAvailabilityRow[];
  pending: ListingAvailabilityRow[];
  booked: ListingAvailabilityRow[];
};

export type DayAvailabilityVisual = 'available' | 'blocked' | 'pending' | 'booked';

export function mapListingAvailabilityFromSupabase(
  row: Record<string, unknown>
): ListingAvailabilityRow | null {
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  const listingId = typeof row.listing_id === 'string' ? row.listing_id.trim() : '';
  const sd = row.start_date;
  const ed = row.end_date;
  const startDate =
    typeof sd === 'string'
      ? sd.slice(0, 10)
      : sd instanceof Date
        ? sd.toISOString().slice(0, 10)
        : '';
  const endDate =
    typeof ed === 'string'
      ? ed.slice(0, 10)
      : ed instanceof Date
        ? ed.toISOString().slice(0, 10)
        : '';
  const t = row.availability_type;
  const availabilityType =
    t === 'blocked' || t === 'pending' || t === 'booked' ? t : null;
  if (!id || !listingId || !startDate || !endDate || !availabilityType) return null;

  const so = row.source_offer_id;
  const sr = row.source_request_id;
  const cb = row.created_by_user_id;
  const ca = row.created_at;

  return {
    id,
    listingId,
    startDate,
    endDate,
    availabilityType,
    sourceOfferId: typeof so === 'string' && so.trim() !== '' ? so.trim() : null,
    sourceRequestId: typeof sr === 'string' && sr.trim() !== '' ? sr.trim() : null,
    createdByUserId: typeof cb === 'string' && cb.trim() !== '' ? cb.trim() : null,
    createdAt: ca != null ? String(ca) : '',
  };
}

/** Group rows for UI / engines (does not merge adjacent segments). */
export function getListingAvailabilityRanges(rows: ListingAvailabilityRow[]): ListingAvailabilityBuckets {
  const blocked: ListingAvailabilityRow[] = [];
  const pending: ListingAvailabilityRow[] = [];
  const booked: ListingAvailabilityRow[] = [];
  for (const r of rows) {
    if (r.availabilityType === 'blocked') blocked.push(r);
    else if (r.availabilityType === 'pending') pending.push(r);
    else if (r.availabilityType === 'booked') booked.push(r);
  }
  return { all: rows, blocked, pending, booked };
}

export type RangeAvailabilityOptions = {
  /** When updating an existing listing offer, its pending hold may overlap its own window. */
  ignoreOfferId?: string | null;
};

export function isDateRangeAvailable(
  startIso: string,
  endIso: string,
  rows: ListingAvailabilityRow[],
  opts?: RangeAvailabilityOptions
): boolean {
  if (compareIsoDate(startIso, endIso) > 0) return false;
  const ignore = opts?.ignoreOfferId?.trim() ?? '';
  for (const r of rows) {
    if (!rangesOverlapInclusive(startIso, endIso, r.startDate, r.endDate)) continue;
    if (r.availabilityType === 'booked') return false;
    if (r.availabilityType === 'blocked') return false;
    if (r.availabilityType === 'pending') {
      if (ignore && r.sourceOfferId === ignore) continue;
      return false;
    }
  }
  return true;
}

export function dayVisualState(
  dayIso: string,
  rows: ListingAvailabilityRow[],
  opts?: RangeAvailabilityOptions
): DayAvailabilityVisual {
  const ignore = opts?.ignoreOfferId?.trim() ?? '';
  const order: Record<DayAvailabilityVisual, number> = {
    available: 0,
    blocked: 1,
    pending: 2,
    booked: 3,
  };
  let best: DayAvailabilityVisual = 'available';
  for (const r of rows) {
    if (compareIsoDate(dayIso, r.startDate) < 0 || compareIsoDate(dayIso, r.endDate) > 0) continue;
    if (r.availabilityType === 'pending' && ignore && r.sourceOfferId === ignore) continue;
    const v: DayAvailabilityVisual =
      r.availabilityType === 'booked'
        ? 'booked'
        : r.availabilityType === 'pending'
          ? 'pending'
          : 'blocked';
    if (order[v] > order[best]) best = v;
  }
  return best;
}

export function billingDaysInclusive(startIso: string, endIso: string): number {
  return inclusiveDayCount(startIso, endIso);
}

export async function fetchListingAvailability(
  listingId: string
): Promise<{ ok: boolean; rows: ListingAvailabilityRow[]; message?: string }> {
  const lid = listingId.trim();
  if (!lid) return { ok: false, rows: [], message: 'Missing listing.' };
  if (!isSupabaseConfigured()) return { ok: false, rows: [], message: 'Server not configured.' };
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('listing_availability')
    .select('*')
    .eq('listing_id', lid)
    .order('start_date', { ascending: true });
  if (error) {
    if (__DEV__) console.warn('[listing_availability] fetch', error.message);
    return { ok: false, rows: [], message: error.message };
  }
  const rows: ListingAvailabilityRow[] = [];
  for (const raw of data ?? []) {
    const m = mapListingAvailabilityFromSupabase(raw as Record<string, unknown>);
    if (m) rows.push(m);
  }
  return { ok: true, rows };
}

export async function createPendingAvailabilityHold(input: {
  listingId: string;
  startIso: string;
  endIso: string;
  sourceOfferId: string;
}): Promise<{ ok: boolean; message?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, message: 'Server not configured.' };
  const me = getAuthUserIdSync().trim();
  if (!me) return { ok: false, message: 'Sign in to continue.' };
  const listingId = input.listingId.trim();
  const offerId = input.sourceOfferId.trim();
  if (!listingId || !offerId) return { ok: false, message: 'Missing listing or offer.' };
  if (compareIsoDate(input.startIso, input.endIso) > 0) return { ok: false, message: 'Invalid date range.' };

  const supabase = getSupabase();
  const { error } = await supabase.from('listing_availability').insert({
    listing_id: listingId,
    start_date: input.startIso,
    end_date: input.endIso,
    availability_type: 'pending',
    source_offer_id: offerId,
    source_request_id: null,
    created_by_user_id: me,
  });
  if (error) {
    if (__DEV__) console.warn('[listing_availability] insert pending', error.message);
    return { ok: false, message: error.message ?? 'Could not reserve dates.' };
  }
  return { ok: true };
}

export async function removePendingAvailabilityHold(offerId: string): Promise<{ ok: boolean; message?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, message: 'Server not configured.' };
  const id = offerId.trim();
  if (!id) return { ok: false, message: 'Missing offer.' };
  const supabase = getSupabase();
  const { error } = await supabase
    .from('listing_availability')
    .delete()
    .eq('source_offer_id', id)
    .eq('availability_type', 'pending');
  if (error) {
    if (__DEV__) console.warn('[listing_availability] delete pending', error.message);
    return { ok: false, message: error.message };
  }
  return { ok: true };
}

/** Drop booked calendar hold when a listing-linked rental reaches a terminal status. */
export async function releaseBookedListingAvailabilityForRental(input: {
  offerId?: string | null;
  rentalRequestId?: string | null;
}): Promise<{ ok: boolean; message?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, message: 'Server not configured.' };
  const offerId = input.offerId?.trim() ?? '';
  const rentalRequestId = input.rentalRequestId?.trim() ?? '';
  if (!offerId && !rentalRequestId) return { ok: true };

  const supabase = getSupabase();
  if (rentalRequestId) {
    const { error } = await supabase
      .from('listing_availability')
      .delete()
      .eq('source_request_id', rentalRequestId)
      .eq('availability_type', 'booked');
    if (error) {
      if (__DEV__) console.warn('[listing_availability] delete booked request', error.message);
      return { ok: false, message: error.message };
    }
  }
  if (offerId) {
    const { error } = await supabase
      .from('listing_availability')
      .delete()
      .eq('source_offer_id', offerId)
      .eq('availability_type', 'booked');
    if (error) {
      if (__DEV__) console.warn('[listing_availability] delete booked offer', error.message);
      return { ok: false, message: error.message };
    }
  }
  return { ok: true };
}

/** Extend a booked hold when an approved rental extension moves the return date later. */
export async function extendBookedAvailabilityEndForOffer(
  offerId: string,
  newReturnIso: string
): Promise<{ ok: boolean; message?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, message: 'Server not configured.' };
  const id = offerId.trim();
  const endDate = newReturnIso.trim().slice(0, 10);
  if (!id || endDate.length < 10) return { ok: false, message: 'Missing offer or date.' };
  const supabase = getSupabase();
  const { data, error: fetchErr } = await supabase
    .from('listing_availability')
    .select('id, end_date')
    .eq('source_offer_id', id)
    .eq('availability_type', 'booked')
    .limit(1)
    .maybeSingle();
  if (fetchErr) {
    if (__DEV__) console.warn('[listing_availability] extend booked fetch', fetchErr.message);
    return { ok: false, message: fetchErr.message };
  }
  if (!data) return { ok: true };
  const currentEnd =
    typeof data.end_date === 'string'
      ? data.end_date.slice(0, 10)
      : data.end_date instanceof Date
        ? data.end_date.toISOString().slice(0, 10)
        : '';
  if (currentEnd && compareIsoDate(endDate, currentEnd) <= 0) return { ok: true };
  const rowId = typeof data.id === 'string' ? data.id : '';
  if (!rowId) return { ok: true };
  const { error } = await supabase
    .from('listing_availability')
    .update({ end_date: endDate })
    .eq('id', rowId)
    .eq('availability_type', 'booked');
  if (error) {
    if (__DEV__) console.warn('[listing_availability] extend booked', error.message);
    return { ok: false, message: error.message };
  }
  return { ok: true };
}

export async function convertPendingToBooked(offerId: string): Promise<{ ok: boolean; message?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, message: 'Server not configured.' };
  const id = offerId.trim();
  if (!id) return { ok: false, message: 'Missing offer.' };
  const supabase = getSupabase();
  const { error } = await supabase
    .from('listing_availability')
    .update({ availability_type: 'booked' })
    .eq('source_offer_id', id)
    .eq('availability_type', 'pending');
  if (error) {
    if (__DEV__) console.warn('[listing_availability] convert booked', error.message);
    return { ok: false, message: error.message };
  }
  return { ok: true };
}

export async function replacePendingHoldForOffer(input: {
  listingId: string;
  startIso: string;
  endIso: string;
  sourceOfferId: string;
}): Promise<{ ok: boolean; message?: string }> {
  const r0 = await removePendingAvailabilityHold(input.sourceOfferId);
  if (!r0.ok) return r0;
  return createPendingAvailabilityHold(input);
}

export async function insertOwnerBlockedRange(input: {
  listingId: string;
  startIso: string;
  endIso: string;
}): Promise<{ ok: boolean; message?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, message: 'Server not configured.' };
  const me = getAuthUserIdSync().trim();
  if (!me) return { ok: false, message: 'Sign in to continue.' };
  const listingId = input.listingId.trim();
  if (!listingId) return { ok: false, message: 'Missing listing.' };
  if (compareIsoDate(input.startIso, input.endIso) > 0) return { ok: false, message: 'Invalid date range.' };

  const supabase = getSupabase();
  const { error } = await supabase.from('listing_availability').insert({
    listing_id: listingId,
    start_date: input.startIso,
    end_date: input.endIso,
    availability_type: 'blocked',
    source_offer_id: null,
    source_request_id: null,
    created_by_user_id: me,
  });
  if (error) {
    if (__DEV__) console.warn('[listing_availability] insert blocked', error.message);
    return { ok: false, message: error.message ?? 'Could not block dates.' };
  }
  return { ok: true };
}

export async function deleteOwnerBlockedRow(rowId: string): Promise<{ ok: boolean; message?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, message: 'Server not configured.' };
  const id = rowId.trim();
  if (!id) return { ok: false, message: 'Missing row.' };
  const supabase = getSupabase();
  const { error } = await supabase.from('listing_availability').delete().eq('id', id).eq('availability_type', 'blocked');
  if (error) {
    if (__DEV__) console.warn('[listing_availability] delete blocked', error.message);
    return { ok: false, message: error.message };
  }
  return { ok: true };
}

export function findBlockedRowIdsForSingleDay(rows: ListingAvailabilityRow[], dayIso: string): string[] {
  return rows
    .filter(
      (r) =>
        r.availabilityType === 'blocked' &&
        r.startDate === dayIso &&
        r.endDate === dayIso
    )
    .map((r) => r.id);
}

export function findBlockedRowsCoveringDay(
  rows: ListingAvailabilityRow[],
  dayIso: string
): ListingAvailabilityRow[] {
  return rows.filter(
    (r) =>
      r.availabilityType === 'blocked' &&
      compareIsoDate(dayIso, r.startDate) >= 0 &&
      compareIsoDate(dayIso, r.endDate) <= 0
  );
}

export function firstSelectableDateFromToday(): string {
  return isoDateFromLocalDate(new Date());
}

export function expandBlockedRowToDailyIds(row: ListingAvailabilityRow): { id: string; day: string }[] {
  if (row.availabilityType !== 'blocked') return [];
  const out: { id: string; day: string }[] = [];
  let cur = row.startDate;
  while (compareIsoDate(cur, row.endDate) <= 0) {
    out.push({ id: row.id, day: cur });
    cur = addCalendarDays(cur, 1);
  }
  return out;
}
