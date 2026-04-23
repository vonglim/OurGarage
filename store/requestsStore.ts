import { create } from 'zustand';

import type { HowKey } from '@/lib/deliveryFormat';
import type { DurationType } from '@/lib/durationFormat';
import { needsDeliveryFee } from '@/lib/deliveryFormat';
import { isSupabaseConfigured } from '@/lib/supabase';
import { fetchRemoteRequestsMerged, insertRequestToSupabase } from '@/lib/supabaseRequests';
import { getRequestOwnerId, getRequestSupabaseRowId, isUuidString } from '@/lib/requestOwnership';
import { shouldBlockSelfNotificationToUserId } from '@/lib/notificationRecipientGuard';
import { addNotification } from './notificationsStore';
import { getAuthUserIdSync } from '@/lib/authUser';
import { getProfile, touchLastActive } from './profileStore';

export type RentalStatus = 'pending' | 'matched' | 'active' | 'completed';

type RequestsStoreState = {
  requests: any[];
};

export const useRequestsStore = create<RequestsStoreState>(() => ({
  requests: [],
}));

function setRequests(next: any[]): void {
  useRequestsStore.setState({ requests: next });
}

/** Derive lifecycle status; supports legacy rows before `rentalStatus` existed. */
export function getEffectiveRentalStatus(req: {
  rentalStatus?: RentalStatus;
  matched?: boolean;
  fulfilled?: boolean;
  rentalStart?: number | null;
}): RentalStatus {
  if (req.rentalStatus) return req.rentalStatus;
  if (req.fulfilled === true) return 'completed';
  if (req.rentalStart != null) return 'active';
  if (req.matched) return 'matched';
  return 'pending';
}

export function getRequestByTimestamp(timestamp: number) {
  return useRequestsStore.getState().requests.find((r) => r.timestamp === timestamp);
}

/** Resolve a request by Supabase `requests.id` (UUID). */
export function getRequestBySupabaseId(supabaseRequestId: string) {
  const id = String(supabaseRequestId).trim();
  if (!isUuidString(id)) return undefined;
  return useRequestsStore.getState().requests.find((r) => {
    const row = r as Record<string, unknown>;
    return getRequestSupabaseRowId(row) === id;
  });
}

/**
 * In-app `requests` rows are keyed by `timestamp`; offer rows use that as `requestId`.
 * Accepts a numeric key or a Supabase UUID that maps to a request row.
 */
export function resolveRequestStoreTimestamp(
  key: string | number | null | undefined
): number | null {
  if (key == null) return null;
  if (typeof key === 'number' && Number.isFinite(key)) return key;
  if (typeof key === 'string') {
    if (isUuidString(key)) {
      const r = getRequestBySupabaseId(key);
      const t = (r as { timestamp?: number } | undefined)?.timestamp;
      if (typeof t === 'number' && Number.isFinite(t)) return t;
      return null;
    }
    const n = Number(key);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Resolve a request from a route/search param: UUID string, numeric timestamp, or numeric string.
 */
export function resolveRequestFromRouteId(raw: string | number | null | undefined) {
  if (raw == null) return undefined;
  if (typeof raw === 'number' && Number.isFinite(raw)) return getRequestByTimestamp(raw);
  const s = String(raw).trim();
  if (s === '') return undefined;
  if (isUuidString(s)) return getRequestBySupabaseId(s);
  const n = Number(s);
  if (Number.isFinite(n)) return getRequestByTimestamp(n);
  return undefined;
}

export function requestAcceptsOffers(timestamp: number): boolean {
  const r = getRequestByTimestamp(timestamp);
  if (!r) return false;
  return getEffectiveRentalStatus(r) === 'pending';
}

/**
 * In-app follow-ups (chat, local rental record, toasts) after the request+offers store
 * already reflect a match from Supabase. Does not write store state.
 */
export function emitAcceptMatchSideEffects(
  before: Record<string, unknown> | null | undefined,
  requestTimestamp: number,
  acceptedOfferId: string,
  acceptedPrice: number
): void {
  const { getOfferById } = require('./offersStore') as typeof import('./offersStore');
  const { ensureChatForAcceptedOffer } = require('./chatStore') as typeof import('./chatStore');
  const { addRentalForAcceptedOffer } = require('./rentalsStore') as typeof import('./rentalsStore');

  const after = getRequestByTimestamp(requestTimestamp);
  if (!after?.matched) return;

  ensureChatForAcceptedOffer(requestTimestamp, acceptedOfferId);
  const accepted = getOfferById(acceptedOfferId);
  const ownerId = getRequestOwnerId((before ?? after) as Record<string, unknown>);
  if (
    accepted != null &&
    ownerId != null &&
    typeof accepted.renterId === 'string' &&
    accepted.renterId.trim() !== ''
  ) {
    addRentalForAcceptedOffer({
      requestId: requestTimestamp,
      offerId: acceptedOfferId,
      renterId: accepted.renterId.trim(),
      ownerId,
      price: Number.isFinite(acceptedPrice) ? acceptedPrice : 0,
    });
  }

  if (before && !before.matched) {
    const forUserId =
      typeof accepted?.renterId === 'string' && accepted.renterId.trim() !== ''
        ? accepted.renterId.trim()
        : null;
    const notifyRequestId =
      getRequestSupabaseRowId(before) ?? getRequestSupabaseRowId(after as Record<string, unknown>) ?? requestTimestamp;
    if (forUserId) {
      const offerSenderRecipientId = forUserId;
      if (!shouldBlockSelfNotificationToUserId(offerSenderRecipientId)) {
        addNotification({
          type: 'offer_accepted',
          message:
            'The other party accepted your offer.\nReview the rental agreement and next steps in Activity.',
          requestId: notifyRequestId,
          offerId: acceptedOfferId,
          forUserId: offerSenderRecipientId,
        });
      }
    }
  }
}

/** Rental ended — user can leave a review. */
export function isLeaveReviewEligible(req: {
  matched?: boolean;
  fulfilled?: boolean;
  rentalStatus?: RentalStatus;
}): boolean {
  return getEffectiveRentalStatus(req) === 'completed';
}

export function showMarkRentalComplete(req: {
  matched?: boolean;
  fulfilled?: boolean;
  rentalStatus?: RentalStatus;
}): boolean {
  return getEffectiveRentalStatus(req) === 'active';
}

export function markRequestRentalComplete(requestTimestamp: number): void {
  const next = useRequestsStore.getState().requests.map((r) => {
    if (r.timestamp !== requestTimestamp || !r.matched) return r;
    if (getEffectiveRentalStatus(r) !== 'active') return r;
    return { ...r, fulfilled: true, rentalStatus: 'completed' satisfies RentalStatus };
  });
  setRequests(next);
}

/** After handoff checklist: records start time and marks rental active (in-app only). */
export function confirmRentalHandoff(requestTimestamp: number): void {
  const now = Date.now();
  const next = useRequestsStore.getState().requests.map((r) => {
    if (r.timestamp !== requestTimestamp || !r.matched) return r;
    if (r.rentalStart != null) return r;
    return {
      ...r,
      rentalStart: now,
      rentalActive: true,
      rentalStatus: 'active' satisfies RentalStatus,
    };
  });
  setRequests(next);
}

/** Load shared requests from Supabase (no-op if env not configured). */
export async function refreshRequestsFromSupabase(): Promise<void> {
  const local = useRequestsStore.getState().requests;
  const merged = await fetchRemoteRequestsMerged(local as Record<string, unknown>[]);
  if (merged == null) return;
  setRequests(merged as any[]);
}

export async function addRequest(request: any): Promise<void> {
  const copy = { ...request };
  delete copy.duration;
  delete copy.budget;
  const posterUserId = getAuthUserIdSync();

  const inserted = await insertRequestToSupabase(
    {
      toolName: String(copy.toolName ?? '').trim(),
      when: (copy.when as string | null) ?? null,
      how: String(copy.how ?? 'pickup_nearby'),
      pickupRadiusMiles:
        typeof copy.pickupRadiusMiles === 'number' && Number.isFinite(copy.pickupRadiusMiles)
          ? copy.pickupRadiusMiles
          : null,
      durationType: String(copy.durationType ?? 'multiDay'),
      durationValue:
        typeof copy.durationValue === 'number' && Number.isFinite(copy.durationValue)
          ? copy.durationValue
          : null,
      totalPrice:
        typeof copy.totalPrice === 'number' && Number.isFinite(copy.totalPrice)
          ? copy.totalPrice
          : 0,
      deliveryFee:
        typeof copy.deliveryFee === 'number' && Number.isFinite(copy.deliveryFee)
          ? copy.deliveryFee
          : null,
      location: String(copy.location ?? '').trim(),
      requestLat:
        typeof copy.requestLat === 'number' && Number.isFinite(copy.requestLat)
          ? copy.requestLat
          : null,
      requestLng:
        typeof copy.requestLng === 'number' && Number.isFinite(copy.requestLng)
          ? copy.requestLng
          : null,
    },
    posterUserId
  );

  if (inserted) {
    useRequestsStore.setState((s) => ({
      requests: [...s.requests.filter((r) => (r as { remoteId?: string }).remoteId !== inserted.remoteId), inserted],
    }));
    touchLastActive();
    return;
  }

  if (isSupabaseConfigured()) {
    throw new Error('Supabase insert failed');
  }

  const row = {
    ...copy,
    matched: false,
    timestamp: Date.now(),
    posterUserId,
    ownerId: posterUserId,
    rentalStatus: 'pending' satisfies RentalStatus,
  };
  useRequestsStore.setState((s) => ({
    requests: [...s.requests, row],
  }));
  touchLastActive();
}

/** Newest first; does not mutate store order. */
export function getRequests(): any[] {
  return [...useRequestsStore.getState().requests].sort(
    (a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0)
  );
}

export function removeRequest(timestamp: number) {
  useRequestsStore.setState((s) => ({
    requests: s.requests.filter((r) => r.timestamp !== timestamp),
  }));
}

/** Wipe all requests (including matched / active / completed “rentals”). */
export function clearAllRequests(): void {
  setRequests([]);
}

export function updateRequest(
  timestamp: number,
  patch: {
    toolName: string;
    when: string | null;
    how: HowKey;
    pickupRadiusMiles?: number | null;
    durationType: DurationType;
    durationValue: number | null;
    totalPrice: number;
    deliveryFee: number | null;
    location: string;
    requestLat: number | null;
    requestLng: number | null;
  }
) {
  const next = useRequestsStore.getState().requests.map((r) => {
    if (r.timestamp !== timestamp) return r;
    const nextRow = { ...r, ...patch };
    delete nextRow.duration;
    delete nextRow.budget;
    if (!needsDeliveryFee(patch.how)) {
      nextRow.deliveryFee = null;
    }
    return nextRow;
  });
  setRequests(next);
}
