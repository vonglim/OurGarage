import { getAuthUserIdSync } from '@/lib/authUser';
import type { NegotiationDeliveryMethod } from '@/lib/negotiationDelivery';
import type { NegotiationOfferStatus } from '@/lib/negotiationOfferTypes';
import type { ListingIntentSnapshot } from '@/lib/listingIntentSnapshot';
import { PROFILE_NAME_FALLBACK } from '@/lib/profileConstants';
import { fetchAndMergeProfileNames, getRemoteDisplayNameForUserId } from '@/lib/remoteProfileCache';
import { getSupabase } from '@/lib/supabase';
import type { ListingOfferActivityRow } from '@/store/listingOffersActivityStore';
import { useListingOffersActivityStore } from '@/store/listingOffersActivityStore';

function parseSnapshot(raw: unknown): ListingIntentSnapshot | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const listing_id = typeof o.listing_id === 'string' ? o.listing_id.trim() : '';
  if (!listing_id) return null;
  const titleRaw = typeof o.title === 'string' ? o.title.trim() : '';
  const title = titleRaw.length > 0 ? titleRaw : 'Listing';
  return {
    listing_id,
    title,
    hero_image_url: typeof o.hero_image_url === 'string' ? o.hero_image_url : null,
    daily_price: typeof o.daily_price === 'number' && Number.isFinite(o.daily_price) ? o.daily_price : 0,
    price_unit: typeof o.price_unit === 'string' ? o.price_unit : null,
    condition_label: typeof o.condition_label === 'string' ? o.condition_label : null,
    delivery_available: typeof o.delivery_available === 'boolean' ? o.delivery_available : null,
    handoff_summary: typeof o.handoff_summary === 'string' ? o.handoff_summary : null,
    service_area: typeof o.service_area === 'string' ? o.service_area : null,
    replacement_value:
      typeof o.replacement_value === 'number' && Number.isFinite(o.replacement_value)
        ? o.replacement_value
        : null,
  };
}

function parseStatus(raw: unknown): NegotiationOfferStatus {
  if (raw === 'accepted' || raw === 'declined' || raw === 'closed' || raw === 'pending' || raw === 'pending_confirmation') {
    return raw;
  }
  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase();
    if (s === 'accepted' || s === 'declined' || s === 'closed' || s === 'pending' || s === 'pending_confirmation') {
      return s as NegotiationOfferStatus;
    }
  }
  return 'pending';
}

function readPrice(row: Record<string, unknown>): number {
  for (const k of ['current_price', 'price']) {
    const v = row[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

function readUpdatedMs(row: Record<string, unknown>): number {
  const v = row.updated_at ?? row.created_at;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : Date.now();
  }
  return Date.now();
}

/**
 * Loads listing-linked `offers` (listing_id set) for Activity: parties are renter (`user_id`) or listing owner.
 */
export async function hydrateListingOffersFromSupabase(): Promise<void> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('offers').select('*').not('listing_id', 'is', null);
  if (error) {
    if (__DEV__) console.warn('[listing-offers] hydrate select', error.message);
    return;
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  const listingIds = [...new Set(rows.map((r) => String(r.listing_id ?? '').trim()).filter(Boolean))];
  const ownerByListing = new Map<string, string>();
  if (listingIds.length > 0) {
    const chunk = 40;
    for (let i = 0; i < listingIds.length; i += chunk) {
      const slice = listingIds.slice(i, i + chunk);
      const { data: lr, error: le } = await supabase.from('listings').select('id, user_id').in('id', slice);
      if (le) {
        if (__DEV__) console.warn('[listing-offers] listings owner fetch', le.message);
        continue;
      }
      for (const x of lr ?? []) {
        const rec = x as { id?: string; user_id?: string };
        const lid = typeof rec.id === 'string' ? rec.id.trim() : '';
        const uid = typeof rec.user_id === 'string' ? rec.user_id.trim() : '';
        if (lid && uid) ownerByListing.set(lid, uid);
      }
    }
  }

  const renterIds = rows.map((r) => String(r.user_id ?? '').trim()).filter(Boolean);
  await fetchAndMergeProfileNames(supabase, [...new Set(renterIds)]);

  const me = getAuthUserIdSync().trim();
  const out: ListingOfferActivityRow[] = [];
  for (const r of rows) {
    const id = typeof r.id === 'string' ? r.id.trim() : '';
    const listingId = typeof r.listing_id === 'string' ? r.listing_id.trim() : '';
    const renterUserId = typeof r.user_id === 'string' ? r.user_id.trim() : '';
    if (!id || !listingId || !renterUserId) continue;
    const listingOwnerUserId = ownerByListing.get(listingId) ?? '';
    if (me && renterUserId !== me && listingOwnerUserId !== me) continue;

    const ndm = r.negotiation_delivery_method;
    const method: NegotiationDeliveryMethod | null =
      ndm === 'pickup' || ndm === 'owner_delivery' ? ndm : null;
    const ndf = r.negotiation_delivery_fee;
    const fee =
      typeof ndf === 'number' && Number.isFinite(ndf) ? Math.max(0, ndf) : ndf == null ? null : null;

    const pc = r.poster_counter_count;
    const posterCounterCount =
      typeof pc === 'number' && Number.isFinite(pc) ? Math.max(0, Math.floor(pc)) : 0;

    out.push({
      id,
      listingId,
      renterUserId,
      listingOwnerUserId,
      currentPrice: readPrice(r),
      status: parseStatus(r.status),
      updatedAtMs: readUpdatedMs(r),
      negotiationDeliveryMethod: method,
      negotiationDeliveryFee: fee,
      posterCounterCount,
      snapshot: parseSnapshot(r.listing_snapshot),
      renterDisplayName: getRemoteDisplayNameForUserId(renterUserId)?.trim() || PROFILE_NAME_FALLBACK,
    });
  }
  out.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  useListingOffersActivityStore.getState().setRows(out);
}
