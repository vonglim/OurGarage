import { getAuthUserIdSync } from '@/lib/authUser';
import { hydrateListingOffersFromSupabase } from '@/lib/hydrateListingOffersFromSupabase';
import { insertServerNotificationToRecipient } from '@/lib/insertServerNotification';
import type { ListingIntentSnapshot } from '@/lib/listingIntentSnapshot';
import type { ListingOfferSubmitPayload } from '@/lib/listingOfferFromDraft';
import {
  fetchListingAvailability,
  isDateRangeAvailable,
  replacePendingHoldForOffer,
} from '@/lib/listingAvailability';
import { formatUsd } from '@/lib/money';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { upsertNegotiationListingOfferToSupabase } from '@/lib/supabaseNegotiation';
import { hydrateListingAvailability } from '@/store/listingAvailabilityStore';

export type SubmitListingOfferResult =
  | { ok: true; offerId: string }
  | { ok: false; message: string };

export async function submitInitialListingOffer(args: {
  listingId: string;
  ownerUserId: string;
  snapshot: ListingIntentSnapshot;
  payload: ListingOfferSubmitPayload;
  /** When re-submitting on an existing thread, ignore that offer's pending hold during conflict checks. */
  existingOfferId?: string | null;
}): Promise<SubmitListingOfferResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: 'Server is not configured.' };
  }
  const renterId = getAuthUserIdSync().trim();
  const owner = args.ownerUserId.trim();
  if (!renterId) {
    return { ok: false, message: 'Sign in to make an offer.' };
  }
  if (!owner || owner === renterId) {
    return { ok: false, message: 'You cannot offer on your own listing.' };
  }

  const listingId = args.listingId.trim();
  const sb = getSupabase();
  const existingOfferIdTrim = args.existingOfferId?.trim() ?? '';

  let messageKind: 'initial' | 'renter_update' = 'initial';
  let posterCounterCount: number | undefined;

  if (existingOfferIdTrim) {
    const { data: ex, error: exErr } = await sb
      .from('offers')
      .select('id, listing_id, user_id, negotiation_locked, status, poster_counter_count')
      .eq('id', existingOfferIdTrim)
      .maybeSingle();
    if (exErr || !ex || typeof ex !== 'object') {
      return { ok: false, message: 'Could not load your existing offer.' };
    }
    const exListing = typeof (ex as { listing_id?: unknown }).listing_id === 'string' ? (ex as { listing_id: string }).listing_id.trim() : '';
    const exUser = typeof (ex as { user_id?: unknown }).user_id === 'string' ? (ex as { user_id: string }).user_id.trim() : '';
    if (exListing !== listingId || exUser !== renterId) {
      return { ok: false, message: 'Offer no longer matches this listing.' };
    }
    if ((ex as { negotiation_locked?: unknown }).negotiation_locked === true) {
      return { ok: false, message: 'Negotiation on this thread is closed.' };
    }
    const st = typeof (ex as { status?: unknown }).status === 'string' ? (ex as { status: string }).status.trim() : '';
    if (st !== 'pending') {
      return { ok: false, message: 'You can only update an open negotiation.' };
    }
    const pc = (ex as { poster_counter_count?: unknown }).poster_counter_count;
    posterCounterCount =
      typeof pc === 'number' && Number.isFinite(pc) ? Math.max(0, Math.floor(pc)) : undefined;
    messageKind = 'renter_update';
  }

  const avail = await fetchListingAvailability(listingId);
  if (!avail.ok) {
    return { ok: false, message: avail.message ?? 'Could not verify availability.' };
  }
  const ignore = existingOfferIdTrim || '';
  if (
    !isDateRangeAvailable(args.payload.rentalStartDate, args.payload.rentalEndDate, avail.rows, {
      ignoreOfferId: ignore || undefined,
    })
  ) {
    return { ok: false, message: 'Those dates are no longer available.' };
  }

  const row = await upsertNegotiationListingOfferToSupabase({
    listingId,
    listingSnapshot: args.snapshot as unknown as Record<string, unknown>,
    posterUserId: owner,
    renterId,
    currentPrice: args.payload.price,
    lastUpdatedBy: renterId,
    status: 'pending',
    message: args.payload.message,
    messageKind,
    offer_images: args.payload.offer_images,
    offer_evidence: args.payload.offer_evidence,
    toolDescription: args.payload.toolDescription,
    replacementValue: args.payload.replacementValue,
    itemCondition: args.payload.itemCondition,
    negotiationDelivery: args.payload.negotiationDelivery,
    rentalStartDate: args.payload.rentalStartDate,
    rentalEndDate: args.payload.rentalEndDate,
    ...(posterCounterCount !== undefined ? { posterCounterCount } : {}),
  });

  if (!row?.id) {
    return { ok: false, message: 'Could not send offer. Try again after a moment.' };
  }

  const hold = await replacePendingHoldForOffer({
    listingId,
    startIso: args.payload.rentalStartDate,
    endIso: args.payload.rentalEndDate,
    sourceOfferId: row.id,
  });
  if (!hold.ok) {
    if (row.wasInsert) {
      await sb.from('offers').delete().eq('id', row.id);
    }
    return { ok: false, message: hold.message ?? 'Could not reserve those dates.' };
  }

  insertServerNotificationToRecipient({
    actorId: renterId,
    recipientUserId: owner,
    type: messageKind === 'renter_update' ? 'offer_updated' : 'offer_created',
    title: messageKind === 'renter_update' ? 'Listing offer updated' : 'New offer on your listing',
    body:
      messageKind === 'renter_update'
        ? `${args.snapshot.title} · updated to ${formatUsd(args.payload.price)} estimated total.`
        : `${args.snapshot.title} · ${formatUsd(args.payload.price)} estimated total.`,
    requestId: null,
    offerId: row.id,
    listingId,
  });
  void hydrateListingOffersFromSupabase();
  void hydrateListingAvailability(listingId);

  return { ok: true, offerId: row.id };
}
