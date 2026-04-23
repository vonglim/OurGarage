import { create } from 'zustand';

import { getAuthUserIdSync } from '@/lib/authUser';
import { getNumericOfferPrice } from '@/lib/money';
import { MAX_POSTER_COUNTER_OFFERS } from '@/lib/negotiationOfferConstants';
import type { Offer } from '@/lib/negotiationOfferTypes';
import { getProfileNameForUserId } from '@/lib/profileDisplayName';
import { getPublicProfileForView } from '@/lib/publicProfiles';
import { getRequestOwnerId, getRequestSupabaseRowId } from '@/lib/requestOwnership';
import { logOfferSync, syncRequestAndOffersFromSupabase } from '@/lib/supabaseOfferSync';
import { upsertNegotiationOfferToSupabase } from '@/lib/supabaseNegotiation';
import { insertServerNotificationRow } from '@/lib/insertServerNotification';
import { isSupabaseConfigured } from '@/lib/supabase';
import { shouldBlockSelfNotificationToUserId } from '@/lib/notificationRecipientGuard';
import { addNotification } from './notificationsStore';
import { touchLastActive } from './profileStore';
import { getRequestByTimestamp, requestAcceptsOffers, resolveRequestStoreTimestamp } from './requestsStore';

export { MAX_POSTER_COUNTER_OFFERS } from '@/lib/negotiationOfferConstants';
export type { NegotiationOfferStatus, Offer, OfferMessageEntry } from '@/lib/negotiationOfferTypes';

function upsertByRequestAndRenter(offers: Offer[], incoming: Offer): Offer[] {
  const idx = offers.findIndex(
    (o) => o.requestId === incoming.requestId && o.renterId === incoming.renterId
  );
  if (idx === -1) return [...offers, incoming];
  const prev = offers[idx];
  const merged: Offer = {
    ...prev,
    ...incoming,
    id: incoming.id,
    messageHistory:
      incoming.messageHistory.length > 0 ? incoming.messageHistory : prev.messageHistory,
  };
  return [...offers.slice(0, idx), merged, ...offers.slice(idx + 1)];
}

type OffersStoreState = {
  offers: Offer[];
  upsertOffer: (offer: Offer) => void;
  removeOffersByRequestId: (requestId: number) => void;
  /** Replace all offer threads for one app `requestId` (timestamp) with server result. */
  replaceOffersForRequestThread: (requestTimestamp: number, next: Offer[]) => void;
};

export const useOffersStore = create<OffersStoreState>((set) => ({
  offers: [],
  upsertOffer: (offer) =>
    set((s) => ({
      offers: upsertByRequestAndRenter(s.offers, offer),
    })),
  removeOffersByRequestId: (requestId) =>
    set((s) => ({
      offers: s.offers.filter((o) => o.requestId !== requestId),
    })),
  replaceOffersForRequestThread: (requestTimestamp, next) =>
    set((s) => ({
      offers: [...s.offers.filter((o) => o.requestId !== requestTimestamp), ...next],
    })),
}));

export function getOfferById(offerId: string): Offer | undefined {
  return useOffersStore.getState().offers.find((o) => o.id === offerId);
}

export function getOfferByRequestAndRenterId(
  requestId: number,
  renterId: string
): Offer | undefined {
  return useOffersStore
    .getState()
    .offers.find((o) => o.requestId === requestId && o.renterId === renterId);
}

export function posterCounterOffersRemainingForRenter(
  requestId: number | string,
  renterId: string
): number {
  const ts = resolveRequestStoreTimestamp(requestId);
  if (ts == null) return MAX_POSTER_COUNTER_OFFERS;
  const o = getOfferByRequestAndRenterId(ts, renterId);
  if (!o) return MAX_POSTER_COUNTER_OFFERS;
  return Math.max(0, MAX_POSTER_COUNTER_OFFERS - o.posterCounterCount);
}

const COUNTER_OFFER_NOTIF_TITLE = 'Counter Offer';
const COUNTER_OFFER_NOTIF_BODY = 'You received a counter offer';

/**
 * `requesterId` = request owner, `offerRenterId` = the renter on this offer thread. Notifies
 * the party who did not send this counter: request owner ↔ renter.
 */
function notifyUserOfCounterOffer(args: {
  currentUserId: string;
  requesterId: string;
  offerRenterId: string;
  requestRowId: string;
  offerId: string;
}): void {
  const me = args.currentUserId.trim();
  const requester = args.requesterId.trim();
  const renter = args.offerRenterId.trim();
  if (me === '' || requester === '' || renter === '' || requester === renter) {
    return;
  }
  // Recipient: the other participant (never the actor of this counter).
  const recipientId: string = me === requester ? renter : requester;
  if (shouldBlockSelfNotificationToUserId(recipientId)) {
    return;
  }
  const notifyRequestId = args.requestRowId;
  addNotification({
    type: 'counter_offer',
    message: `${COUNTER_OFFER_NOTIF_TITLE}\n${COUNTER_OFFER_NOTIF_BODY}`,
    requestId: notifyRequestId,
    offerId: args.offerId,
    forUserId: recipientId,
  });
  insertServerNotificationRow({
    recipientUserId: recipientId,
    type: 'counter_offer',
    title: COUNTER_OFFER_NOTIF_TITLE,
    body: COUNTER_OFFER_NOTIF_BODY,
    requestId: notifyRequestId,
    offerId: args.offerId,
  });
}

export async function addOffer(
  requestId: number,
  requestRowId: string,
  opts?: { message?: string; price: number; toolDescription?: string }
): Promise<boolean> {
  if (!isSupabaseConfigured() || !requestRowId) return false;
  if (!requestAcceptsOffers(requestId)) return false;
  const req = getRequestByTimestamp(requestId);
  if (!req) return false;
  if (req.posterUserId != null && req.posterUserId === getAuthUserIdSync()) {
    return false;
  }
  if (
    opts == null ||
    typeof opts.price !== 'number' ||
    !Number.isFinite(opts.price) ||
    opts.price < 0
  ) {
    return false;
  }
  const renterId = getAuthUserIdSync();
  const existing = getOfferByRequestAndRenterId(requestId, renterId);
  if (existing?.status === 'pending_confirmation') {
    return false;
  }
  const nextPosterCount = existing?.posterCounterCount ?? 0;
  const hadPosterInteraction =
    existing != null &&
    (() => {
      const oId = getRequestOwnerId(req as Record<string, unknown>);
      return (
        oId != null &&
        (existing.lastUpdatedBy === oId || existing.posterCounterCount > 0)
      );
    })();
  const ownerId = getRequestOwnerId(req as Record<string, unknown>);

  logOfferSync('before_write', 'addOffer (upsertNegotiationOfferToSupabase)', { requestRowId, renterId });
  const res = await upsertNegotiationOfferToSupabase({
    requestRowId,
    posterUserId: getRequestOwnerId(req as Record<string, unknown>),
    renterId,
    currentPrice: opts.price,
    lastUpdatedBy: renterId,
    message: opts.message,
    posterCounterCount: nextPosterCount,
    messageKind: existing ? 'renter_update' : 'initial',
  });
  if (res == null) {
    logOfferSync('supabase_response', 'addOffer write failed', { requestRowId });
    return false;
  }
  logOfferSync('supabase_response', 'addOffer write ok', { offerId: res.id });

  const synced = await syncRequestAndOffersFromSupabase(requestRowId, requestId);
  if (!synced) {
    logOfferSync('supabase_response', 'addOffer post-write sync failed', { requestRowId });
    return false;
  }
  logOfferSync('store_updated', 'addOffer', { requestId, offerId: res.id });
  touchLastActive();

  const requestOwnerId = ownerId;
  if (requestOwnerId && requestOwnerId !== renterId) {
    const notifyRequestId = requestRowId;
    if (hadPosterInteraction) {
      notifyUserOfCounterOffer({
        currentUserId: renterId,
        requesterId: requestOwnerId,
        offerRenterId: renterId,
        requestRowId: notifyRequestId,
        offerId: res.id,
      });
    } else {
      const offerRecipientId = requestOwnerId;
      if (!shouldBlockSelfNotificationToUserId(offerRecipientId)) {
        addNotification({
          type: 'new_offer',
          message: 'You received a new offer\nPlease review it in Activity.',
          requestId: notifyRequestId,
          offerId: res.id,
          forUserId: offerRecipientId,
        });
        insertServerNotificationRow({
          recipientUserId: offerRecipientId,
          type: 'new_offer',
          title: 'New offer received',
          body: 'Someone sent you an offer',
          requestId: notifyRequestId,
          offerId: res.id,
        });
      }
    }
  }
  return true;
}

export async function addPosterCounterOffer(
  requestId: number | string,
  offerId: string,
  opts: { price: number; message?: string }
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const ts = resolveRequestStoreTimestamp(requestId);
  if (ts == null) return false;
  if (!requestAcceptsOffers(ts)) return false;
  const req = getRequestByTimestamp(ts);
  if (!req) return false;
  const requestRowId = getRequestSupabaseRowId(req as Record<string, unknown>);
  if (!requestRowId) return false;
  const owner = getRequestOwnerId(req as Record<string, unknown>);
  if (owner == null || owner !== getAuthUserIdSync().trim()) return false;
  const offer = getOfferById(offerId);
  if (!offer || offer.requestId !== ts) return false;
  if (
    opts == null ||
    typeof opts.price !== 'number' ||
    !Number.isFinite(opts.price) ||
    opts.price < 0
  ) {
    return false;
  }
  if (offer.posterCounterCount >= MAX_POSTER_COUNTER_OFFERS) {
    return false;
  }
  if (offer.status !== 'pending') {
    return false;
  }
  const posterId = getAuthUserIdSync();
  const nextCount = offer.posterCounterCount + 1;

  logOfferSync('before_write', 'addPosterCounterOffer', { requestRowId, offerId });
  const res = await upsertNegotiationOfferToSupabase({
    requestRowId,
    posterUserId: getRequestOwnerId(req as Record<string, unknown>),
    renterId: offer.renterId,
    currentPrice: opts.price,
    lastUpdatedBy: posterId,
    message: opts.message,
    posterCounterCount: nextCount,
    messageKind: 'poster_counter',
  });
  if (res == null) {
    logOfferSync('supabase_response', 'addPosterCounterOffer write failed', { requestRowId });
    return false;
  }
  const synced = await syncRequestAndOffersFromSupabase(requestRowId, ts);
  if (!synced) return false;
  logOfferSync('store_updated', 'addPosterCounterOffer', { requestRowId, offerId: res.id });
  touchLastActive();

  if (owner != null && typeof offer.renterId === 'string' && offer.renterId.trim() !== '') {
    notifyUserOfCounterOffer({
      currentUserId: posterId,
      requesterId: owner,
      offerRenterId: offer.renterId,
      requestRowId,
      offerId: res.id,
    });
  }
  return true;
}

/**
 * Renter accepts the poster’s current proposed price (e.g. after a counter).
 * The poster is then expected to open the rental agreement to finalize the match.
 */
export async function addRenterAcceptsPosterProposed(offerId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const before = getOfferById(offerId);
  if (!before) return false;
  const me = getAuthUserIdSync().trim();
  if (me !== before.renterId.trim()) return false;
  if (before.status !== 'pending' || !requestAcceptsOffers(before.requestId)) return false;
  const req = getRequestByTimestamp(before.requestId);
  if (!req) return false;
  if (req.matched) return false;
  const owner = getRequestOwnerId(req as Record<string, unknown>);
  if (owner == null || owner === me) return false;
  if (before.lastUpdatedBy === me) return false;
  if (before.lastUpdatedBy !== owner) return false;

  const requestRowId = getRequestSupabaseRowId(req as Record<string, unknown>);
  if (!requestRowId) return false;
  const price = getNumericOfferPrice(before);

  logOfferSync('before_write', 'addRenterAcceptsPosterProposed', { requestRowId, offerId });
  const res = await upsertNegotiationOfferToSupabase({
    requestRowId,
    posterUserId: getRequestOwnerId(req as Record<string, unknown>),
    renterId: before.renterId,
    currentPrice: price,
    lastUpdatedBy: me,
    status: 'pending_confirmation',
    message: 'Accepted the counter — awaiting owner confirmation',
    posterCounterCount: before.posterCounterCount,
    messageKind: 'renter_accepts',
  });
  if (res == null) {
    logOfferSync('supabase_response', 'addRenterAcceptsPosterProposed write failed', { requestRowId });
    return false;
  }
  const synced = await syncRequestAndOffersFromSupabase(requestRowId, before.requestId);
  if (!synced) return false;
  logOfferSync('store_updated', 'addRenterAcceptsPosterProposed', { requestRowId, offerId: res.id });
  touchLastActive();
  return true;
}

/**
 * @deprecated Use `finalizeOfferAcceptance` from `@/lib/finalizeOfferAcceptance` in UI. Kept for one-line callers.
 */
export async function confirmRentalByPoster(offerId: string): Promise<boolean> {
  const offer = getOfferById(offerId);
  if (offer == null) return false;
  const { finalizeOfferAcceptance } = await import('@/lib/finalizeOfferAcceptance');
  const r = await finalizeOfferAcceptance(offer.requestId, offerId);
  return r.ok;
}

export function sortOffersForPoster(offers: Offer[]): Offer[] {
  return [...offers].sort((a, b) => {
    const pa = getNumericOfferPrice(a);
    const pb = getNumericOfferPrice(b);
    if (pa !== pb) return pa - pb;
    const ra = getOfferUserPreview(a).rating;
    const rb = getOfferUserPreview(b).rating;
    if (rb !== ra) return rb - ra;
    return 0;
  });
}

export function getOffersForRequest(requestId: number): Offer[] {
  const list = useOffersStore
    .getState()
    .offers.filter(
      (o) => o.requestId === requestId && o.status !== 'declined' && o.status !== 'closed'
    );
  return sortOffersForPoster(list);
}

export function countOffersForRequest(requestId: number): number {
  return useOffersStore
    .getState()
    .offers.filter(
      (o) => o.requestId === requestId && o.status !== 'declined' && o.status !== 'closed'
    ).length;
}

export async function declineOffer(
  requestId: number | string,
  offerId: string
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const ts = resolveRequestStoreTimestamp(requestId);
  if (ts == null) return false;
  if (!requestAcceptsOffers(ts)) return false;
  const before = getOfferById(offerId);
  if (!before || before.requestId !== ts) return false;
  const req = getRequestByTimestamp(ts);
  const requestRowId = req ? getRequestSupabaseRowId(req as Record<string, unknown>) : null;
  if (!requestRowId) return false;
  const posterId = getAuthUserIdSync();

  logOfferSync('before_write', 'declineOffer', { requestRowId, offerId });
  const res = await upsertNegotiationOfferToSupabase({
    requestRowId,
    posterUserId: getRequestOwnerId(req as Record<string, unknown>),
    renterId: before.renterId,
    currentPrice: before.currentPrice,
    lastUpdatedBy: posterId,
    status: 'declined',
    posterCounterCount: before.posterCounterCount,
    messageKind: 'declined',
  });
  if (res == null) {
    logOfferSync('supabase_response', 'declineOffer write failed', { requestRowId });
    return false;
  }
  const synced = await syncRequestAndOffersFromSupabase(requestRowId, ts);
  if (!synced) return false;
  logOfferSync('store_updated', 'declineOffer', { requestRowId, offerId: res.id });
  touchLastActive();
  return true;
}

export function removeOffersForRequest(requestId: number) {
  useOffersStore.getState().removeOffersByRequestId(requestId);
}

export function getOffers(): Offer[] {
  return [...useOffersStore.getState().offers];
}

export function clearAllOffers(): void {
  useOffersStore.setState({ offers: [] });
}

export function getOfferUserPreview(offer: Offer): {
  userId: string;
  name: string;
  rating: number;
  avatar: string;
  lastActive: number;
} {
  const renter = offer.renterId;
  if (
    typeof renter === 'string' &&
    renter.length > 0 &&
    typeof offer.offerUserName === 'string' &&
    offer.offerUserName.trim().length > 0
  ) {
    const pub = getPublicProfileForView(renter);
    const lastActive =
      typeof offer.offerUserLastActive === 'number' && Number.isFinite(offer.offerUserLastActive)
        ? offer.offerUserLastActive
        : pub.lastActive;
    const avatar =
      typeof offer.offerUserAvatar === 'string' && offer.offerUserAvatar.trim().length > 0
        ? offer.offerUserAvatar.trim()
        : pub.avatar;
    return {
      userId: renter,
      name: offer.offerUserName.trim(),
      rating:
        typeof offer.offerUserRating === 'number' && Number.isFinite(offer.offerUserRating)
          ? offer.offerUserRating
          : 4.8,
      avatar,
      lastActive,
    };
  }
  if (typeof renter !== 'string' || renter.trim() === '') {
    return {
      userId: '',
      name: '—',
      rating: 0,
      avatar: getPublicProfileForView('').avatar,
      lastActive: Date.now(),
    };
  }
  const userId = renter.trim();
  const pub = getPublicProfileForView(userId);
  return {
    userId,
    name: getProfileNameForUserId(userId),
    rating: pub.ratingNumber,
    avatar: pub.avatar,
    lastActive: pub.lastActive,
  };
}
