import { getAuthUserIdSync } from '@/lib/authUser';
import type { NegotiationDeliveryMethod } from '@/lib/negotiationDelivery';
import type { NegotiationOfferStatus } from '@/lib/negotiationOfferTypes';
import { parseListingIntentSnapshot, type ListingIntentSnapshot } from '@/lib/listingIntentSnapshot';
import { PROFILE_NAME_FALLBACK } from '@/lib/profileConstants';
import { getPublicProfileForView } from '@/lib/publicProfiles';
import { fetchAndMergeProfileNames, getRemoteDisplayNameForUserId } from '@/lib/remoteProfileCache';
import { getSupabase } from '@/lib/supabase';
import type { ListingOfferActivityRow } from '@/store/listingOffersActivityStore';
import { useListingOffersActivityStore } from '@/store/listingOffersActivityStore';

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
    const fee = typeof ndf === 'number' && Number.isFinite(ndf) ? Math.max(0, ndf) : null;

    const pc = r.poster_counter_count;
    const posterCounterCount =
      typeof pc === 'number' && Number.isFinite(pc) ? Math.max(0, Math.floor(pc)) : 0;

    const ndt = r.negotiation_decline_total ?? r.negotiationDeclineTotal;
    const negotiationDeclineTotal =
      typeof ndt === 'number' && Number.isFinite(ndt) ? Math.max(0, Math.floor(ndt)) : 0;

    const nl = r.negotiation_locked ?? r.negotiationLocked;
    const negotiationLocked = nl === true || nl === 't';

    const lub = r.last_updated_by ?? r.lastUpdatedBy;
    const lastUpdatedBy = typeof lub === 'string' ? lub.trim() : '';

    const lnk = r.last_negotiation_event_kind ?? r.lastNegotiationEventKind;
    const lastNegotiationEventKind = typeof lnk === 'string' && lnk.trim() !== '' ? lnk.trim() : null;

    const rv = r.replacement_value;
    const replacementValue =
      typeof rv === 'number' && Number.isFinite(rv) ? rv : null;
    const rs = r.rental_start_date;
    const re = r.rental_end_date;
    const rentalStartDate = typeof rs === 'string' && rs.trim() !== '' ? rs.trim() : null;
    const rentalEndDate = typeof re === 'string' && re.trim() !== '' ? re.trim() : null;
    const td = r.tool_description;
    const toolDescription = typeof td === 'string' && td.trim() !== '' ? td.trim() : null;
    const renterRating = getPublicProfileForView(renterUserId).ratingNumber;

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
      negotiationDeclineTotal,
      negotiationLocked,
      lastUpdatedBy,
      lastNegotiationEventKind,
      snapshot: parseListingIntentSnapshot(r.listing_snapshot),
      renterDisplayName: getRemoteDisplayNameForUserId(renterUserId)?.trim() || PROFILE_NAME_FALLBACK,
      rentalStartDate,
      rentalEndDate,
      replacementValue,
      toolDescription,
      renterRating,
    });
  }
  out.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  useListingOffersActivityStore.getState().setRows(out);
}
