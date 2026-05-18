import type { SupabaseClient } from '@supabase/supabase-js';

import { agreedScheduleIsoPairFromRequest } from '@/lib/agreedRentalScheduleFromRequest';
import { parseListingIntentSnapshot, type ListingIntentSnapshot } from '@/lib/listingIntentSnapshot';
import type { NegotiationDeliveryMethod } from '@/lib/negotiationDelivery';
import { parseHandoffPreference } from '@/lib/rentalWizard/wizardMeetupDraft';
import type { RentalWizardRentalRow } from '@/lib/rentalWizard/types';

export type RentalWizardEnrichment = {
  listingSnapshot: ListingIntentSnapshot | null;
  listingSnapshotRaw: unknown;
  agreedDeliveryMethod: NegotiationDeliveryMethod;
  agreedDeliveryFee: number | null;
  scheduleHints: {
    rentalStartDate: string | null;
    rentalEndDate: string | null;
    returnIso: string | null;
  };
  requestSchedulingMeta: unknown;
};

function scheduleFromOfferRow(row: Record<string, unknown>): RentalWizardEnrichment['scheduleHints'] {
  const rs = typeof row.rental_start_date === 'string' ? row.rental_start_date.trim() : null;
  const re = typeof row.rental_end_date === 'string' ? row.rental_end_date.trim() : null;
  let returnIso: string | null = null;
  if (rs && re && /^\d{4}-\d{2}-\d{2}$/.test(rs) && /^\d{4}-\d{2}-\d{2}$/.test(re)) {
    const pair = agreedScheduleIsoPairFromRequest({
      requested_start_date: rs,
      requested_end_date: re,
    });
    returnIso = pair.returnIso;
  }
  return { rentalStartDate: rs, rentalEndDate: re, returnIso };
}

export async function fetchRentalWizardEnrichment(
  supabase: SupabaseClient,
  rental: RentalWizardRentalRow
): Promise<RentalWizardEnrichment> {
  let listingSnapshot: ListingIntentSnapshot | null = null;
  let listingSnapshotRaw: unknown = null;
  let agreedDeliveryMethod: NegotiationDeliveryMethod = 'pickup';
  let agreedDeliveryFee: number | null = null;
  let scheduleHints: RentalWizardEnrichment['scheduleHints'] = {
    rentalStartDate: null,
    rentalEndDate: null,
    returnIso: null,
  };
  let requestSchedulingMeta: unknown = null;

  const offerId =
    rental.offer_id != null && String(rental.offer_id).trim() !== '' ? String(rental.offer_id).trim() : null;
  const rentalRequestId =
    rental.rental_request_id != null && String(rental.rental_request_id).trim() !== ''
      ? String(rental.rental_request_id).trim()
      : null;

  if (offerId) {
    const { data } = await supabase.from('offers').select('*').eq('id', offerId).maybeSingle();
    if (data && typeof data === 'object') {
      const row = data as Record<string, unknown>;
      listingSnapshotRaw = row.listing_snapshot;
      listingSnapshot = parseListingIntentSnapshot(listingSnapshotRaw);
      const ndm = row.negotiation_delivery_method;
      if (ndm === 'pickup' || ndm === 'owner_delivery') {
        agreedDeliveryMethod = ndm;
      }
      const ndf = row.negotiation_delivery_fee;
      if (typeof ndf === 'number' && Number.isFinite(ndf)) agreedDeliveryFee = Math.max(0, ndf);
      scheduleHints = scheduleFromOfferRow(row);
    }
  } else if (rentalRequestId) {
    const { data } = await supabase
      .from('rental_requests')
      .select('*')
      .eq('id', rentalRequestId)
      .maybeSingle();
    if (data && typeof data === 'object') {
      const row = data as Record<string, unknown>;
      listingSnapshotRaw = row.listing_snapshot;
      listingSnapshot = parseListingIntentSnapshot(listingSnapshotRaw);
      requestSchedulingMeta = row;
      const pref = typeof row.handoff_preference === 'string' ? row.handoff_preference : null;
      agreedDeliveryMethod =
        parseHandoffPreference(pref) === 'delivery' ? 'owner_delivery' : 'pickup';
      const rs = typeof row.requested_start_date === 'string' ? row.requested_start_date.trim() : null;
      const re = typeof row.requested_end_date === 'string' ? row.requested_end_date.trim() : null;
      const pair = agreedScheduleIsoPairFromRequest(row);
      scheduleHints = {
        rentalStartDate: rs,
        rentalEndDate: re,
        returnIso: pair.returnIso,
      };
    }
  } else if (rental.listing_id) {
    const { data } = await supabase
      .from('listings')
      .select('id, title, image_urls')
      .eq('id', rental.listing_id)
      .maybeSingle();
    if (data && typeof data === 'object') {
      const row = data as { title?: string; image_urls?: unknown };
      const urls = Array.isArray(row.image_urls)
        ? row.image_urls.filter((u): u is string => typeof u === 'string' && u.trim() !== '')
        : [];
      listingSnapshotRaw = {
        listing_id: rental.listing_id,
        title: row.title ?? 'Listing',
        hero_image_url: urls[0] ?? null,
        images: urls,
      };
      listingSnapshot = parseListingIntentSnapshot(listingSnapshotRaw);
    }
  }

  return {
    listingSnapshot,
    listingSnapshotRaw,
    agreedDeliveryMethod,
    agreedDeliveryFee,
    scheduleHints,
    requestSchedulingMeta,
  };
}
