import { getSupabase } from '@/lib/supabase';
import type { ListingIntentSnapshot } from '@/lib/listingIntentSnapshot';
import { insertRentalRequestWithSchemaCompat } from '@/lib/rentalRequestInsertSchemaCompat';
import { logRentalLifecycle } from '@/lib/rentalLifecycleDebug';
import { mergeRecentNotificationsFromServer } from '@/lib/notificationsServerSync';

export type RentalRequestDurationInput = 'full' | 'multiDay' | 'weekly';

export type HandoffPreference = 'pickup' | 'owner_delivery' | 'either';

export type InsertRentalRequestResult =
  | { ok: true; id: string }
  | { ok: false; message: string };

/** Maps wizard / UI duration to `rental_requests.duration_type` (includes `multi_day` after migration 056). */
function durationTypeForDb(d: RentalRequestDurationInput): 'full' | 'week' | 'multi_day' {
  if (d === 'weekly') return 'week';
  if (d === 'multiDay') return 'multi_day';
  return 'full';
}

export async function insertRentalRequest(row: {
  listingId: string;
  renterUserId: string;
  durationType: RentalRequestDurationInput;
  price: number;
  listingSnapshot: ListingIntentSnapshot;
  requestedStartDate: string;
  requestedEndDate: string;
  handoffPreference: HandoffPreference;
  renterMessage?: string | null;
}): Promise<InsertRentalRequestResult> {
  const listingId = row.listingId.trim();
  const renterUserId = row.renterUserId.trim();
  if (!listingId || !renterUserId) {
    return { ok: false, message: 'Missing listing or renter.' };
  }

  const supabase = getSupabase();

  let ownerUserId: string | null = null;
  const { data: listingRow } = await supabase
    .from('listings')
    .select('user_id')
    .eq('id', listingId)
    .maybeSingle();
  const lr = listingRow as Record<string, unknown> | null | undefined;
  if (lr && typeof lr.user_id === 'string' && lr.user_id.trim() !== '') {
    ownerUserId = lr.user_id.trim();
  }

  if (!ownerUserId) {
    return { ok: false, message: 'Could not resolve listing owner.' };
  }

  const duration_type = durationTypeForDb(row.durationType);
  const msg = row.renterMessage?.trim() ?? '';

  const initialPayload: Record<string, unknown> = {
    listing_id: listingId,
    renter_user_id: renterUserId,
    owner_user_id: ownerUserId,
    duration_type,
    price: row.price,
    status: 'pending',
    listing_snapshot: row.listingSnapshot,
    requested_start_date: row.requestedStartDate,
    requested_end_date: row.requestedEndDate,
    handoff_preference: row.handoffPreference,
    renter_message: msg.length > 0 ? msg : null,
  };

  const { data, error } = await insertRentalRequestWithSchemaCompat(supabase, initialPayload);

  if (error) {
    logRentalLifecycle('rental_request_insert_failed', {
      listingId,
      message: error.message,
    });
    return { ok: false, message: error.message || 'Could not save rental request.' };
  }

  const rid = (data as { id?: string } | null)?.id?.trim();
  if (!rid) {
    logRentalLifecycle('rental_request_insert_missing_id', { listingId });
    return { ok: false, message: 'Rental request may have saved but no id was returned.' };
  }

  logRentalLifecycle('rental_request_insert_ok', {
    rentalRequestId: rid,
    listingId,
    renterUserId,
    ownerUserId,
  });
  mergeRecentNotificationsFromServer();
  return { ok: true, id: rid };
}
