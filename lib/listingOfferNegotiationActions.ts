import { getAuthUserIdSync } from '@/lib/authUser';
import { hydrateListingOffersFromSupabase } from '@/lib/hydrateListingOffersFromSupabase';
import { removePendingAvailabilityHold } from '@/lib/listingAvailability';
import { insertServerNotificationToRecipient } from '@/lib/insertServerNotification';
import { mergeRecentNotificationsFromServer } from '@/lib/notificationsServerSync';
import { NEGOTIATION_MAX_DECLINES_BEFORE_LOCK } from '@/lib/negotiationLifecycleConstants';
import { MAX_POSTER_COUNTER_OFFERS } from '@/lib/negotiationOfferConstants';
import type { NegotiationDeliveryMethod } from '@/lib/negotiationDelivery';
import { getSupabase } from '@/lib/supabase';
import { upsertNegotiationListingOfferToSupabase } from '@/lib/supabaseNegotiation';
import { hydrateListingAvailability } from '@/store/listingAvailabilityStore';

async function loadListingOfferRow(offerId: string): Promise<Record<string, unknown> | null> {
  const id = offerId.trim();
  if (!id) return null;
  const supabase = getSupabase();
  const { data: row, error } = await supabase.from('offers').select('*').eq('id', id).maybeSingle();
  if (error || !row) {
    if (__DEV__) console.warn('[listing-offer-negotiation] offer fetch', error?.message);
    return null;
  }
  const rec = row as Record<string, unknown>;
  if (rec.listing_id == null || String(rec.listing_id).trim() === '') {
    return null;
  }
  return rec;
}

async function fetchListingOwnerId(listingId: string): Promise<string> {
  const supabase = getSupabase();
  const { data: listing } = await supabase.from('listings').select('user_id').eq('id', listingId).maybeSingle();
  const uid =
    listing && typeof (listing as { user_id?: unknown }).user_id === 'string'
      ? String((listing as { user_id: string }).user_id).trim()
      : '';
  return uid;
}

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
    console.warn('[listing-offer-negotiation] fetchLatestTermsBodyFromOfferMessages', error.message);
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

function readInt(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  return 0;
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

function readListingSnapshot(row: Record<string, unknown>): Record<string, unknown> {
  const raw = row.listing_snapshot;
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

/**
 * Owner declines the renter’s latest proposal only (mirrors request-thread `declineOffer` proposal intent).
 * Thread usually stays `pending` until decline cap locks it.
 */
export async function ownerDeclineListingOfferProposal(
  offerId: string,
  options?: { reason?: string }
): Promise<{ ok: boolean; message?: string; negotiationClosed?: boolean }> {
  const me = getAuthUserIdSync().trim();
  if (!me) return { ok: false, message: 'Sign in to continue.' };
  const id = offerId.trim();
  if (!id) return { ok: false, message: 'Missing offer.' };

  const row = await loadListingOfferRow(id);
  if (!row) return { ok: false, message: 'Offer not found.' };

  const listingId = typeof row.listing_id === 'string' ? row.listing_id.trim() : '';
  const renterId = typeof row.user_id === 'string' ? row.user_id.trim() : '';
  if (!listingId || !renterId) return { ok: false, message: 'Invalid listing offer.' };

  const owner = await fetchListingOwnerId(listingId);
  if (owner !== me) {
    return { ok: false, message: 'Only the listing host can update this offer.' };
  }

  const status = typeof row.status === 'string' ? row.status.trim() : '';
  if (status !== 'pending' && status !== 'pending_confirmation') {
    return { ok: false, message: 'This offer is not open for negotiation.' };
  }

  const locked =
    row.negotiation_locked === true ||
    row.negotiation_locked === 't' ||
    row.negotiationLocked === true;
  if (locked) {
    return { ok: false, message: 'Negotiation on this thread is closed.' };
  }

  const lastMover = String(row.last_updated_by ?? row.lastUpdatedBy ?? '').trim();
  if (lastMover === '' || lastMover === me) {
    return { ok: false, message: 'Nothing to decline yet — waiting on the renter’s latest offer.' };
  }

  const prevDeclines = readInt(row.negotiation_decline_total ?? row.negotiationDeclineTotal);
  const nextD = prevDeclines + 1;
  const lockFromDecline = nextD >= NEGOTIATION_MAX_DECLINES_BEFORE_LOCK;
  const nextStatus = lockFromDecline ? 'declined' : status === 'pending_confirmation' ? 'pending' : status;

  let messageToPersist: string | undefined;
  if (status === 'pending_confirmation') {
    const restored = await fetchLatestTermsBodyFromOfferMessages(id);
    if (restored != null) {
      messageToPersist = restored;
    } else {
      const stripped = String(row.message ?? '')
        .replace(/\n*Accepted the counter — awaiting owner confirmation\s*/i, '')
        .trim();
      if (stripped.length > 0) messageToPersist = stripped;
    }
  }

  const proposalBody = buildProposalDeclinedMessageBody(options?.reason);
  const price = readPrice(row);

  const res = await upsertNegotiationListingOfferToSupabase({
    listingId,
    listingSnapshot: readListingSnapshot(row),
    posterUserId: owner,
    renterId,
    currentPrice: price,
    lastUpdatedBy: me,
    status: nextStatus as 'pending' | 'declined',
    ...(messageToPersist !== undefined ? { message: messageToPersist } : {}),
    threadEventBody: proposalBody,
    posterCounterCount: readInt(row.poster_counter_count ?? row.posterCounterCount),
    messageKind: 'proposal_declined',
    negotiationLifecycle: {
      negotiationDeclineTotal: nextD,
      negotiationLocked: lockFromDecline,
    },
  });

  if (res == null) {
    return { ok: false, message: 'Could not update negotiation. Try again.' };
  }

  if (lockFromDecline) {
    void removePendingAvailabilityHold(id);
  }
  void hydrateListingAvailability(listingId);

  if (renterId && renterId !== me) {
    insertServerNotificationToRecipient({
      actorId: me,
      recipientUserId: renterId,
      type: 'offer_updated',
      title: 'Offer declined',
      body: lockFromDecline
        ? 'Negotiation on this listing offer has closed after several declines.'
        : 'The host declined this offer. You can send a revised offer while negotiation stays open.',
      requestId: null,
      offerId: id,
      listingId,
    });
  }

  mergeRecentNotificationsFromServer();
  void hydrateListingOffersFromSupabase();

  return { ok: true, negotiationClosed: lockFromDecline };
}

export async function ownerCounterListingOffer(args: {
  offerId: string;
  /** Rental subtotal (matches `offers.current_price` listing convention, excludes delivery fee). */
  basePrice: number;
  message: string;
  negotiationDelivery: { method: NegotiationDeliveryMethod; fee: number | null };
}): Promise<{ ok: boolean; message?: string }> {
  const me = getAuthUserIdSync().trim();
  if (!me) return { ok: false, message: 'Sign in to continue.' };
  const id = args.offerId.trim();
  if (!id) return { ok: false, message: 'Missing offer.' };

  if (typeof args.basePrice !== 'number' || !Number.isFinite(args.basePrice) || args.basePrice <= 0) {
    return { ok: false, message: 'Enter a valid rental amount.' };
  }

  const row = await loadListingOfferRow(id);
  if (!row) return { ok: false, message: 'Offer not found.' };

  const listingId = typeof row.listing_id === 'string' ? row.listing_id.trim() : '';
  const renterId = typeof row.user_id === 'string' ? row.user_id.trim() : '';
  if (!listingId || !renterId) return { ok: false, message: 'Invalid listing offer.' };

  const owner = await fetchListingOwnerId(listingId);
  if (owner !== me) {
    return { ok: false, message: 'Only the listing host can counter this offer.' };
  }

  const status = typeof row.status === 'string' ? row.status.trim() : '';
  if (status !== 'pending') {
    return { ok: false, message: 'You can only counter an open offer.' };
  }

  const locked =
    row.negotiation_locked === true ||
    row.negotiation_locked === 't' ||
    row.negotiationLocked === true;
  if (locked) {
    return { ok: false, message: 'Negotiation on this thread is closed.' };
  }

  const prevCount = readInt(row.poster_counter_count ?? row.posterCounterCount);
  if (prevCount >= MAX_POSTER_COUNTER_OFFERS) {
    return { ok: false, message: 'You have used the maximum number of counters for this thread.' };
  }

  const nextCount = prevCount + 1;
  const msg = args.message.trim();
  if (!msg) {
    return { ok: false, message: 'Add a short message with your counter.' };
  }

  const res = await upsertNegotiationListingOfferToSupabase({
    listingId,
    listingSnapshot: readListingSnapshot(row),
    posterUserId: owner,
    renterId,
    currentPrice: args.basePrice,
    lastUpdatedBy: me,
    status: 'pending',
    message: msg,
    posterCounterCount: nextCount,
    messageKind: 'poster_counter',
    negotiationDelivery: args.negotiationDelivery,
  });

  if (res == null) {
    return { ok: false, message: 'Could not send counter. Try again.' };
  }

  if (renterId && renterId !== me) {
    insertServerNotificationToRecipient({
      actorId: me,
      recipientUserId: renterId,
      type: 'counter_offer',
      title: 'Counter offer received',
      body: 'The host sent a counter on your listing offer.',
      requestId: null,
      offerId: id,
      listingId,
    });
  }

  mergeRecentNotificationsFromServer();
  void hydrateListingOffersFromSupabase();
  void hydrateListingAvailability(listingId);

  return { ok: true };
}
