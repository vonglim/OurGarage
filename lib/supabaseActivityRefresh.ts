import { hydrateListingOffersFromSupabase } from '@/lib/hydrateListingOffersFromSupabase';
import { getRequestSupabaseRowId } from '@/lib/requestOwnership';
import { getSupabase } from '@/lib/supabase';
import { fetchAllOffersWithProfiles, mapSupabaseOfferRowToOffer } from '@/lib/supabaseOffers';
import { logRentalLifecycle } from '@/lib/rentalLifecycleDebug';
import { useOffersStore } from '@/store/offersStore';
import { refreshRequestsFromSupabase, useRequestsStore } from '@/store/requestsStore';

/**
 * Pull all `offers` from Supabase and upsert rows for requests we already have
 * (matched by `requests.id` → app `timestamp`).
 */
async function mergeRemoteOffersIntoOffersStore(): Promise<void> {
  const supabase = getSupabase();
  const { data, error } = await fetchAllOffersWithProfiles(supabase);
  if (error) {
    if (__DEV__) console.warn('[Activity refresh] offers fetch:', error.message);
    return;
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return;

  const requests = useRequestsStore.getState().requests;
  const appTimestampByRequestUuid = new Map<string, number>();
  for (const r of requests) {
    const rec = r as Record<string, unknown>;
    const uuid = getRequestSupabaseRowId(rec);
    const ts =
      typeof rec.timestamp === 'number' && Number.isFinite(rec.timestamp) ? rec.timestamp : null;
    if (uuid && ts != null) appTimestampByRequestUuid.set(uuid, ts);
  }

  const upsertOffer = useOffersStore.getState().upsertOffer;
  for (const raw of rows) {
    const rid = raw.request_id;
    const requestUuid = typeof rid === 'string' ? rid.trim() : '';
    if (!requestUuid) continue;
    const appTs = appTimestampByRequestUuid.get(requestUuid);
    if (appTs == null) continue;

    const o = mapSupabaseOfferRowToOffer(raw, appTs);
    upsertOffer(o);
  }
}

/**
 * Activity tab refresh: merged requests from Supabase, then upsert offers (one thread per renter).
 */
export async function refreshActivityScreenFromSupabase(): Promise<void> {
  if (__DEV__) logRentalLifecycle('activity_store_refresh_start');
  await refreshRequestsFromSupabase();
  await mergeRemoteOffersIntoOffersStore();
  await hydrateListingOffersFromSupabase();
  if (__DEV__) logRentalLifecycle('activity_store_refresh_done');
}
