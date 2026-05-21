import type { SupabaseClient } from '@supabase/supabase-js';

import {
  normalizeCalendarYmd,
  resolveContractualRentalWindow,
  type ContractualRentalWindow,
} from '@/lib/rentalContractWindow';
import { decodeDescriptionExtras } from '@/lib/supabaseRequests';

export type RentalContractHydrationInput = {
  id?: string;
  offer_id?: string | null;
  request_id?: string | null;
  rental_request_id?: string | null;
};

export type RentalContractHydration = {
  rentalId: string | null;
  offerId: string | null;
  requestId: string | null;
  rentalRequestId: string | null;
  rentalStartDate: string | null;
  rentalEndDate: string | null;
  offerRentalStartDate: string | null;
  offerRentalEndDate: string | null;
  rentalRequestStartDate: string | null;
  rentalRequestEndDate: string | null;
  requestStartDate: string | null;
  requestEndDate: string | null;
  hydratedContractualWindow: ContractualRentalWindow | null;
  schedulingMeta: Record<string, unknown>;
  scheduleHints: {
    rentalStartDate: string | null;
    rentalEndDate: string | null;
  };
  fetchSource: string;
  fetchErrors: string[];
};

function trimId(raw: string | null | undefined): string | null {
  const s = typeof raw === 'string' ? raw.trim() : '';
  return s.length > 0 ? s : null;
}

function ymdFromRequestRow(row: Record<string, unknown>): { start: string | null; end: string | null } {
  const decoded = decodeDescriptionExtras(
    typeof row.description === 'string' ? row.description : null
  );
  const start =
    normalizeCalendarYmd(
      (typeof decoded.beginAtIso === 'string' && decoded.beginAtIso) ||
        (typeof decoded.pickupDate === 'string' && decoded.pickupDate) ||
        null
    ) ?? null;
  const end =
    normalizeCalendarYmd(
      (typeof decoded.returnAtIso === 'string' && decoded.returnAtIso) ||
        (typeof decoded.returnDate === 'string' && decoded.returnDate) ||
        null
    ) ?? null;
  return { start, end };
}

/**
 * Loads canonical contractual rental dates for workspace meetup coordination.
 * Listing approvals store dates on `rental_requests`; listing offers on `offers`.
 */
export async function fetchRentalContractHydration(
  supabase: SupabaseClient,
  rental: RentalContractHydrationInput
): Promise<RentalContractHydration> {
  const rentalId = trimId(rental.id);
  const offerId = trimId(rental.offer_id);
  const requestId = trimId(rental.request_id);
  const rentalRequestId = trimId(rental.rental_request_id);

  const fetchErrors: string[] = [];
  let offerRow: Record<string, unknown> | null = null;
  let rentalRequestRow: Record<string, unknown> | null = null;
  let requestRow: Record<string, unknown> | null = null;

  if (offerId) {
    const { data, error } = await supabase
      .from('offers')
      .select('id, rental_start_date, rental_end_date, listing_id, request_id')
      .eq('id', offerId)
      .maybeSingle();
    if (error) fetchErrors.push(`offer:${error.message}`);
    else if (data && typeof data === 'object') offerRow = data as Record<string, unknown>;
  }

  if (rentalRequestId) {
    const { data, error } = await supabase
      .from('rental_requests')
      .select('id, requested_start_date, requested_end_date, duration_type, price, listing_id')
      .eq('id', rentalRequestId)
      .maybeSingle();
    if (error) fetchErrors.push(`rental_request:${error.message}`);
    else if (data && typeof data === 'object') rentalRequestRow = data as Record<string, unknown>;
  }

  if (requestId) {
    const { data, error } = await supabase
      .from('requests')
      .select('id, title, description, duration_type, duration_value')
      .eq('id', requestId)
      .maybeSingle();
    if (error) fetchErrors.push(`request:${error.message}`);
    else if (data && typeof data === 'object') requestRow = data as Record<string, unknown>;
  }

  const offerRentalStartDate = normalizeCalendarYmd(
    typeof offerRow?.rental_start_date === 'string' ? offerRow.rental_start_date : null
  );
  const offerRentalEndDate = normalizeCalendarYmd(
    typeof offerRow?.rental_end_date === 'string' ? offerRow.rental_end_date : null
  );

  const rentalRequestStartDate = normalizeCalendarYmd(
    typeof rentalRequestRow?.requested_start_date === 'string'
      ? rentalRequestRow.requested_start_date
      : null
  );
  const rentalRequestEndDate = normalizeCalendarYmd(
    typeof rentalRequestRow?.requested_end_date === 'string' ? rentalRequestRow.requested_end_date : null
  );

  const requestDates = requestRow ? ymdFromRequestRow(requestRow) : { start: null, end: null };
  const requestStartDate = requestDates.start;
  const requestEndDate = requestDates.end;

  const rentalStartDate =
    offerRentalStartDate ?? rentalRequestStartDate ?? requestStartDate ?? null;
  const rentalEndDate = offerRentalEndDate ?? rentalRequestEndDate ?? requestEndDate ?? null;

  const sources: string[] = [];
  if (offerRentalStartDate && offerRentalEndDate) sources.push('offer');
  if (rentalRequestStartDate && rentalRequestEndDate) sources.push('rental_request');
  if (requestStartDate && requestEndDate) sources.push('request');

  let fetchSource = 'none';
  if (offerRentalStartDate && offerRentalEndDate) fetchSource = 'offer';
  else if (rentalRequestStartDate && rentalRequestEndDate) fetchSource = 'rental_request';
  else if (requestStartDate && requestEndDate) fetchSource = 'request';
  else if (rentalStartDate && rentalEndDate) fetchSource = sources.join('+') || 'partial_merge';

  const scheduleHints = {
    rentalStartDate,
    rentalEndDate,
  };

  const decodedRequest = requestRow
    ? decodeDescriptionExtras(typeof requestRow.description === 'string' ? requestRow.description : null)
    : {};

  const schedulingMeta: Record<string, unknown> = {
    ...(requestRow ?? {}),
    ...decodedRequest,
    duration_type:
      requestRow?.duration_type ?? decodedRequest.durationType ?? rentalRequestRow?.duration_type ?? null,
    duration_value: requestRow?.duration_value ?? decodedRequest.durationValue ?? null,
    ...(rentalStartDate
      ? { rental_start_date: rentalStartDate, requested_start_date: rentalStartDate }
      : {}),
    ...(rentalEndDate ? { rental_end_date: rentalEndDate, requested_end_date: rentalEndDate } : {}),
    ...(decodedRequest.pickupDate ? { pickupDate: decodedRequest.pickupDate } : {}),
    ...(decodedRequest.returnDate ? { returnDate: decodedRequest.returnDate } : {}),
    ...(decodedRequest.beginAtIso ? { beginAtIso: decodedRequest.beginAtIso } : {}),
    ...(decodedRequest.returnAtIso ? { returnAtIso: decodedRequest.returnAtIso } : {}),
  };

  const hydratedContractualWindow = resolveContractualRentalWindow({
    rentalStartDate,
    rentalEndDate,
    scheduleHints,
    requestSchedulingMeta: schedulingMeta,
  });

  return {
    rentalId,
    offerId,
    requestId,
    rentalRequestId,
    rentalStartDate,
    rentalEndDate,
    offerRentalStartDate,
    offerRentalEndDate,
    rentalRequestStartDate,
    rentalRequestEndDate,
    requestStartDate,
    requestEndDate,
    hydratedContractualWindow,
    schedulingMeta,
    scheduleHints,
    fetchSource,
    fetchErrors,
  };
}

export function logRentalOwnerContractHydration(hydration: RentalContractHydration): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;

  console.log('[rental-owner-contract-hydration]', {
    rentalId: hydration.rentalId,
    offerId: hydration.offerId,
    requestId: hydration.requestId,
    rentalRequestId: hydration.rentalRequestId,
    rentalStartDate: hydration.rentalStartDate,
    rentalEndDate: hydration.rentalEndDate,
    offerRentalStartDate: hydration.offerRentalStartDate,
    offerRentalEndDate: hydration.offerRentalEndDate,
    rentalRequestStartDate: hydration.rentalRequestStartDate,
    rentalRequestEndDate: hydration.rentalRequestEndDate,
    requestStartDate: hydration.requestStartDate,
    requestEndDate: hydration.requestEndDate,
    hydratedContractualWindow: hydration.hydratedContractualWindow,
    fetchSource: hydration.fetchSource,
    fetchErrors: hydration.fetchErrors,
  });
}
