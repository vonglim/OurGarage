import { create } from 'zustand';

import { getAuthUserIdSync } from '@/lib/authUser';
import type { NegotiationDeliveryMethod } from '@/lib/negotiationDelivery';
import { getNumericOfferPrice } from '@/lib/money';
import {
  NEGOTIATION_MAX_DECLINES_BEFORE_LOCK,
  NEGOTIATION_MAX_WITHDRAW_CYCLES,
  NEGOTIATION_REOFFER_COOLDOWN_MS,
} from '@/lib/negotiationLifecycleConstants';
import { MAX_POSTER_COUNTER_OFFERS } from '@/lib/negotiationOfferConstants';
import type { Offer } from '@/lib/negotiationOfferTypes';
import { PROFILE_NAME_FALLBACK } from '@/lib/profileConstants';
import { getProfileNameForUserId } from '@/lib/profileDisplayName';
import { getPublicProfileForView } from '@/lib/publicProfiles';
import { getRequestOwnerId, getRequestSupabaseRowId } from '@/lib/requestOwnership';
import { logOfferSync, syncRequestAndOffersFromSupabase } from '@/lib/supabaseOfferSync';
import {
  type NegotiationLifecycleDbWrite,
  upsertNegotiationOfferToSupabase,
} from '@/lib/supabaseNegotiation';
import { insertServerNotificationToRecipient } from '@/lib/insertServerNotification';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
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

const COUNTER_OFFER_NOTIF_BODY = 'You received a counter offer';

/**
 * `requesterId` = request owner, `offerRenterId` = the renter on this offer thread. Notifies
 * the party who did not send this counter: request owner ↔ renter.
 */
function notifyUserOfProposalDeclined(args: {
  currentUserId: string;
  requesterId: string;
  offerRenterId: string;
  requestRowId: string;
  offerId: string;
  reason?: string;
}): void {
  const me = args.currentUserId.trim();
  const requester = args.requesterId.trim();
  const renter = args.offerRenterId.trim();
  if (me === '' || requester === '' || renter === '' || requester === renter) {
    return;
  }
  const recipientId: string = me === requester ? renter : requester;
  const trimmedReason = args.reason?.trim() ?? '';
  const body =
    trimmedReason.length > 0
      ? trimmedReason.slice(0, 160)
      : 'Your latest proposal was declined. You can send another counter if negotiation limits allow.';
  insertServerNotificationToRecipient({
    actorId: me,
    recipientUserId: recipientId,
    type: 'offer_updated',
    title: 'Proposal declined',
    body,
    requestId: args.requestRowId,
    offerId: args.offerId,
  });
}

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
  // actor = who sent this counter; recipient = the other user (request owner or renter).
  const recipientId: string = me === requester ? renter : requester;
  const notifyRequestId = args.requestRowId;
  insertServerNotificationToRecipient({
    actorId: me,
    recipientUserId: recipientId,
    type: 'counter_offer',
    title: 'Counter offer received',
    body: COUNTER_OFFER_NOTIF_BODY,
    requestId: notifyRequestId,
    offerId: args.offerId,
  });
}

export async function addOffer(
  requestId: number,
  requestRowId: string,
  opts?: {
    message?: string;
    price: number;
    toolDescription?: string;
    offer_images?: string[];
    negotiationDelivery?: { method: NegotiationDeliveryMethod; fee: number | null };
  }
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
  if (existing?.negotiationLocked) {
    logOfferSync('before_write', 'addOffer blocked locked', { requestRowId, renterId });
    return false;
  }
  if (existing?.status === 'pending_confirmation') {
    return false;
  }
  if (existing?.status === 'closed') {
    const wc = existing.withdrawCycleCount ?? 0;
    const last = existing.lastWithdrawalAt;
    if (wc < 1 && (last == null || !Number.isFinite(last))) {
      logOfferSync('before_write', 'addOffer blocked closed without withdraw', { requestRowId, renterId });
      return false;
    }
    if (wc >= NEGOTIATION_MAX_WITHDRAW_CYCLES) return false;
    if (
      last != null &&
      Number.isFinite(last) &&
      Date.now() - last < NEGOTIATION_REOFFER_COOLDOWN_MS
    ) {
      logOfferSync('before_write', 'addOffer blocked cooldown', { requestRowId, renterId });
      return false;
    }
  }
  const restartingAfterWithdraw = existing?.status === 'closed';
  const nextPosterCount = restartingAfterWithdraw ? 0 : (existing?.posterCounterCount ?? 0);
  const hadPosterInteraction =
    existing != null &&
    !restartingAfterWithdraw &&
    (() => {
      const oId = getRequestOwnerId(req as Record<string, unknown>);
      return (
        oId != null &&
        (existing.lastUpdatedBy === oId || existing.posterCounterCount > 0)
      );
    })();
  const ownerId = getRequestOwnerId(req as Record<string, unknown>);
  const messageKind: 'initial' | 'renter_update' =
    !existing || restartingAfterWithdraw ? 'initial' : 'renter_update';

  logOfferSync('before_write', 'addOffer (upsertNegotiationOfferToSupabase)', { requestRowId, renterId });
  const howRaw = (req as { how?: unknown }).how;
  const res = await upsertNegotiationOfferToSupabase({
    requestRowId,
    posterUserId: getRequestOwnerId(req as Record<string, unknown>),
    renterId,
    currentPrice: opts.price,
    lastUpdatedBy: renterId,
    message: opts.message,
    posterCounterCount: nextPosterCount,
    messageKind,
    ...(opts.offer_images !== undefined ? { offer_images: opts.offer_images } : {}),
    ...(opts.negotiationDelivery !== undefined
      ? { negotiationDelivery: opts.negotiationDelivery }
      : {}),
    requestHowHint: typeof howRaw === 'string' ? howRaw : null,
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
      // Renter updated after the owner countered: notify the request owner only.
      insertServerNotificationToRecipient({
        actorId: renterId,
        recipientUserId: requestOwnerId,
        type: 'offer_updated',
        title: 'Offer updated',
        body: 'The other party updated their offer.',
        requestId: notifyRequestId,
        offerId: res.id,
      });
    } else {
      // First offer on the thread: notify the request owner only.
      insertServerNotificationToRecipient({
        actorId: renterId,
        recipientUserId: requestOwnerId,
        type: 'offer_created',
        title: 'New offer received',
        body: 'You received a new offer.',
        requestId: notifyRequestId,
        offerId: res.id,
      });
    }
  }
  return true;
}

/**
 * Renter updates an existing thread (counter / revise offer) without re-uploading photos or
 * rebuilding item terms. Persists new base `current_price` and merged message body.
 */
export async function addRenterCounterUpdate(
  requestRowId: string,
  offerId: string,
  opts: { basePrice: number; message: string }
): Promise<boolean> {
  if (!isSupabaseConfigured() || !requestRowId || !offerId) return false;
  const me = getAuthUserIdSync().trim();
  const offer = getOfferById(offerId);
  if (!offer || offer.renterId.trim() !== me) return false;
  if (offer.negotiationLocked) return false;
  if (offer.status !== 'pending') return false;
  const ts = offer.requestId;
  if (!requestAcceptsOffers(ts)) return false;
  const req = getRequestByTimestamp(ts);
  if (!req) return false;
  if (
    typeof opts.basePrice !== 'number' ||
    !Number.isFinite(opts.basePrice) ||
    opts.basePrice <= 0
  ) {
    return false;
  }
  const message = opts.message.trim();
  if (!message) return false;

  const ownerId = getRequestOwnerId(req as Record<string, unknown>);

  logOfferSync('before_write', 'addRenterCounterUpdate', { requestRowId, offerId });
  const howRaw = (req as { how?: unknown }).how;
  const res = await upsertNegotiationOfferToSupabase({
    requestRowId,
    posterUserId: ownerId,
    renterId: me,
    currentPrice: opts.basePrice,
    lastUpdatedBy: me,
    message,
    posterCounterCount: offer.posterCounterCount,
    messageKind: 'renter_update',
    requestHowHint: typeof howRaw === 'string' ? howRaw : null,
  });
  if (res == null) {
    logOfferSync('supabase_response', 'addRenterCounterUpdate write failed', { requestRowId });
    return false;
  }
  const synced = await syncRequestAndOffersFromSupabase(requestRowId, ts);
  if (!synced) return false;
  logOfferSync('store_updated', 'addRenterCounterUpdate', { requestRowId, offerId: res.id });
  touchLastActive();

  if (ownerId && ownerId !== me) {
    insertServerNotificationToRecipient({
      actorId: me,
      recipientUserId: ownerId,
      type: 'offer_updated',
      title: 'Offer updated',
      body: 'The other party updated their offer.',
      requestId: requestRowId,
      offerId: res.id,
    });
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
  if (offer.negotiationLocked) return false;
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
  const howRaw = (req as { how?: unknown }).how;
  const res = await upsertNegotiationOfferToSupabase({
    requestRowId,
    posterUserId: getRequestOwnerId(req as Record<string, unknown>),
    renterId: offer.renterId,
    currentPrice: opts.price,
    lastUpdatedBy: posterId,
    message: opts.message,
    posterCounterCount: nextCount,
    messageKind: 'poster_counter',
    requestHowHint: typeof howRaw === 'string' ? howRaw : null,
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
  if (before.negotiationLocked) return false;
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

export type DeclineNegotiationIntent = 'withdraw' | 'decline_proposal';

async function fetchLatestTermsBodyFromOfferMessages(offerId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('offer_messages')
    .select('body')
    .eq('offer_id', offerId.trim())
    .in('kind', ['initial', 'renter_update', 'poster_counter'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error != null && __DEV__) {
    console.warn('[declineOffer] fetchLatestTermsBodyFromOfferMessages', error.message);
  }
  if (data == null || typeof data !== 'object') return null;
  const b = (data as { body?: unknown }).body;
  const s = typeof b === 'string' ? b.trim() : '';
  return s.length > 0 ? s : null;
}

function buildProposalDeclinedMessageBody(reason?: string): string {
  const r = reason?.trim() ?? '';
  if (r.length > 0) {
    return `Proposal declined.\n\nReason: ${r}`;
  }
  return 'Proposal declined.';
}

export async function declineOffer(
  requestId: number | string,
  offerId: string,
  options: { intent: DeclineNegotiationIntent; reason?: string }
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

  const me = getAuthUserIdSync().trim();
  const renterId = before.renterId.trim();
  const ownerId = (getRequestOwnerId(req as Record<string, unknown>) ?? '').trim();
  const awaiting =
    before.status === 'pending' || before.status === 'pending_confirmation';
  if (!awaiting) return false;
  if (before.negotiationLocked) return false;

  const participant = ownerId.length > 0 && me === ownerId ? 'owner' : me === renterId ? 'renter' : null;
  if (participant == null) {
    logOfferSync('before_write', 'declineOffer forbidden actor', {
      requestRowId,
      offerId,
      me,
      renterId,
      ownerId,
    });
    return false;
  }

  const lastMover = String(before.lastUpdatedBy ?? '').trim();
  const lastMoverIsMe = lastMover !== '' && lastMover === me;

  if (options.intent === 'withdraw') {
    if (!lastMoverIsMe) {
      logOfferSync('before_write', 'declineOffer withdraw not last mover', { offerId, me, lastMover });
      return false;
    }
    const closingLine = 'Offer withdrawn.';
    const baseMsg = before.message?.trim() ?? '';
    const message = baseMsg.length > 0 ? `${baseMsg}\n\n${closingLine}` : closingLine;
    const price = getNumericOfferPrice(before);

    const prevDeclines = before.negotiationDeclineTotal ?? 0;
    const prevWithdrawCycles = before.withdrawCycleCount ?? 0;
    const nextW = prevWithdrawCycles + 1;
    const lock =
      nextW >= NEGOTIATION_MAX_WITHDRAW_CYCLES ||
      prevDeclines >= NEGOTIATION_MAX_DECLINES_BEFORE_LOCK;
    const negotiationLifecycle: NegotiationLifecycleDbWrite = {
      withdrawCycleCount: nextW,
      lastWithdrawalAtIso: new Date().toISOString(),
      negotiationLocked: lock,
    };

    logOfferSync('before_write', 'declineOffer withdraw', { requestRowId, offerId });
    const res = await upsertNegotiationOfferToSupabase({
      requestRowId,
      posterUserId: getRequestOwnerId(req as Record<string, unknown>),
      renterId: before.renterId,
      currentPrice: price,
      lastUpdatedBy: me,
      status: 'closed',
      message,
      posterCounterCount: before.posterCounterCount,
      messageKind: 'declined',
      negotiationLifecycle,
    });
    if (res == null) {
      logOfferSync('supabase_response', 'declineOffer write failed', { requestRowId });
      return false;
    }
    const synced = await syncRequestAndOffersFromSupabase(requestRowId, ts);
    if (!synced) return false;
    logOfferSync('store_updated', 'declineOffer withdraw', { requestRowId, offerId: res.id });
    touchLastActive();
    return true;
  }

  /** Reject the latest proposal only; thread stays active until limits or lock. */
  if (lastMoverIsMe) {
    logOfferSync('before_write', 'declineOffer proposal decline but last mover is me', {
      offerId,
      me,
    });
    return false;
  }

  const prevDeclines = before.negotiationDeclineTotal ?? 0;
  const prevWithdrawCycles = before.withdrawCycleCount ?? 0;
  const nextD = prevDeclines + 1;
  const lockFromDecline =
    nextD >= NEGOTIATION_MAX_DECLINES_BEFORE_LOCK ||
    prevWithdrawCycles >= NEGOTIATION_MAX_WITHDRAW_CYCLES;
  const negotiationLifecycle: NegotiationLifecycleDbWrite = {
    negotiationDeclineTotal: nextD,
    negotiationLocked: lockFromDecline,
  };

  const nextStatus = lockFromDecline ? 'declined' : before.status === 'pending_confirmation' ? 'pending' : before.status;

  let messageToPersist: string | undefined;
  if (before.status === 'pending_confirmation') {
    const restored = await fetchLatestTermsBodyFromOfferMessages(before.id);
    if (restored != null) {
      messageToPersist = restored;
    } else {
      const stripped = (before.message ?? '')
        .replace(/\n*Accepted the counter — awaiting owner confirmation\s*/i, '')
        .trim();
      if (stripped.length > 0) messageToPersist = stripped;
    }
  }

  const proposalBody = buildProposalDeclinedMessageBody(options.reason);
  const price = getNumericOfferPrice(before);

  logOfferSync('before_write', 'declineOffer proposal', {
    requestRowId,
    offerId,
    nextStatus,
    lockFromDecline,
  });
  const res = await upsertNegotiationOfferToSupabase({
    requestRowId,
    posterUserId: getRequestOwnerId(req as Record<string, unknown>),
    renterId: before.renterId,
    currentPrice: price,
    lastUpdatedBy: me,
    status: nextStatus,
    ...(messageToPersist !== undefined ? { message: messageToPersist } : {}),
    threadEventBody: proposalBody,
    posterCounterCount: before.posterCounterCount,
    messageKind: 'proposal_declined',
    negotiationLifecycle,
  });
  if (res == null) {
    logOfferSync('supabase_response', 'declineOffer proposal write failed', { requestRowId });
    return false;
  }

  if (ownerId && renterId && ownerId !== renterId) {
    notifyUserOfProposalDeclined({
      currentUserId: me,
      requesterId: ownerId,
      offerRenterId: renterId,
      requestRowId,
      offerId: res.id,
      reason: options.reason,
    });
  }

  const synced = await syncRequestAndOffersFromSupabase(requestRowId, ts);
  if (!synced) return false;
  logOfferSync('store_updated', 'declineOffer proposal', { requestRowId, offerId: res.id });
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
  const fromProfile = offer.profiles?.name?.trim();
  const fromOffer = offer.offerUserName?.trim();
  const name =
    (fromProfile && fromProfile.length > 0 ? fromProfile : null) ||
    (fromOffer && fromOffer.length > 0 ? fromOffer : null) ||
    getProfileNameForUserId(userId).trim() ||
    PROFILE_NAME_FALLBACK;
  const lastActive =
    typeof offer.offerUserLastActive === 'number' && Number.isFinite(offer.offerUserLastActive)
      ? offer.offerUserLastActive
      : pub.lastActive;
  const avatar =
    typeof offer.offerUserAvatar === 'string' && offer.offerUserAvatar.trim().length > 0
      ? offer.offerUserAvatar.trim()
      : pub.avatar;
  return {
    userId,
    name: name || PROFILE_NAME_FALLBACK,
    rating:
      typeof offer.offerUserRating === 'number' && Number.isFinite(offer.offerUserRating)
        ? offer.offerUserRating
        : pub.ratingNumber,
    avatar,
    lastActive,
  };
}
