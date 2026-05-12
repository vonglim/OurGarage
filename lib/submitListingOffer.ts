import { getAuthUserIdSync } from '@/lib/authUser';
import { hydrateListingOffersFromSupabase } from '@/lib/hydrateListingOffersFromSupabase';
import { insertServerNotificationToRecipient } from '@/lib/insertServerNotification';
import type { ListingIntentSnapshot } from '@/lib/listingIntentSnapshot';
import type { ListingOfferSubmitPayload } from '@/lib/listingOfferFromDraft';
import { formatUsd } from '@/lib/money';
import { isSupabaseConfigured } from '@/lib/supabase';
import { upsertNegotiationListingOfferToSupabase } from '@/lib/supabaseNegotiation';

export type SubmitListingOfferResult =
  | { ok: true; offerId: string }
  | { ok: false; message: string };

export async function submitInitialListingOffer(args: {
  listingId: string;
  ownerUserId: string;
  snapshot: ListingIntentSnapshot;
  payload: ListingOfferSubmitPayload;
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

  const row = await upsertNegotiationListingOfferToSupabase({
    listingId: args.listingId.trim(),
    listingSnapshot: args.snapshot as unknown as Record<string, unknown>,
    posterUserId: owner,
    renterId,
    currentPrice: args.payload.price,
    lastUpdatedBy: renterId,
    status: 'pending',
    message: args.payload.message,
    messageKind: 'initial',
    offer_images: args.payload.offer_images,
    offer_evidence: args.payload.offer_evidence,
    toolDescription: args.payload.toolDescription,
    replacementValue: args.payload.replacementValue,
    itemCondition: args.payload.itemCondition,
    negotiationDelivery: args.payload.negotiationDelivery,
  });

  if (!row?.id) {
    return { ok: false, message: 'Could not send offer. Try again after a moment.' };
  }

  insertServerNotificationToRecipient({
    actorId: renterId,
    recipientUserId: owner,
    type: 'offer_created',
    title: 'New offer on your listing',
    body: `${args.snapshot.title} · ${formatUsd(args.payload.price)} estimated total.`,
    requestId: null,
    offerId: row.id,
    listingId: args.listingId.trim(),
  });
  void hydrateListingOffersFromSupabase();

  return { ok: true, offerId: row.id };
}
