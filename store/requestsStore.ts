import { create } from 'zustand';

import type { HowKey } from '@/lib/deliveryFormat';
import type { DurationType } from '@/lib/durationFormat';
import { needsDeliveryFee } from '@/lib/deliveryFormat';
import { isSupabaseConfigured } from '@/lib/supabase';
import { logRequestScheduleDebug } from '@/lib/requestSchedulePersistence';
import {
  appRequestRowToPayload,
  fetchRemoteRequestsMerged,
  insertRequestToSupabase,
  softDeleteRequestInSupabase,
  updateRequestInSupabase,
} from '@/lib/supabaseRequests';
import { getRequestOwnerId, getRequestSupabaseRowId, isUuidString } from '@/lib/requestOwnership';
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
  if ((r as { isActive?: boolean }).isActive === false) return false;
  return getEffectiveRentalStatus(r) === 'pending';
}

/** Owner's Activity "Requests" tab: hide soft-deleted requests. */
export function isOwnerRequestHiddenFromActivity(req: unknown): boolean {
  return typeof req === 'object' && req != null && (req as { isActive?: boolean }).isActive === false;
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
  const requestCreatorId = getRequestOwnerId((before ?? after) as Record<string, unknown>);
  if (
    accepted != null &&
    requestCreatorId != null &&
    typeof accepted.renterId === 'string' &&
    accepted.renterId.trim() !== ''
  ) {
    addRentalForAcceptedOffer({
      requestId: requestTimestamp,
      offerId: acceptedOfferId,
      renterId: requestCreatorId,
      ownerId: accepted.renterId.trim(),
      price: Number.isFinite(acceptedPrice) ? acceptedPrice : 0,
    });
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

  logRequestScheduleDebug('addRequest (incoming)', copy as Record<string, unknown>);

  const inserted = await insertRequestToSupabase(appRequestRowToPayload(copy as Record<string, unknown>), posterUserId);

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
    isActive: true,
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

/**
 * Soft-deletes the request on Supabase (is_active = false, deleted_at = now), syncs offers
 * (negotiation threads close server-side), and updates local store. Local-only rows are removed.
 */
export async function deactivateRequest(timestamp: number): Promise<boolean> {
  const prev = getRequestByTimestamp(timestamp);
  if (prev == null) return false;
  const remoteId = getRequestSupabaseRowId(prev as Record<string, unknown>);
  if (remoteId != null && isSupabaseConfigured()) {
    const ok = await softDeleteRequestInSupabase(remoteId);
    if (!ok) return false;
    const { syncRequestAndOffersFromSupabase } = await import('@/lib/supabaseOfferSync');
    await syncRequestAndOffersFromSupabase(remoteId, timestamp);
    return true;
  }
  const { removeOffersForRequest } = await import('@/store/offersStore');
  removeOffersForRequest(timestamp);
  removeRequest(timestamp);
  return true;
}

/** Wipe all requests (including matched / active / completed “rentals”). */
export function clearAllRequests(): void {
  setRequests([]);
}

export async function updateRequest(
  timestamp: number,
  patch: {
    toolName: string;
    how: HowKey;
    pickupRadiusMiles?: number | null;
    durationType: DurationType;
    durationValue: number | null;
    totalPrice: number;
    deliveryFee: number | null;
    location: string;
    requestLat: number | null;
    requestLng: number | null;
    pickupDate?: string | null;
    returnDate?: string | null;
    beginAtIso?: string | null;
    returnAtIso?: string | null;
  }
): Promise<void> {
  const prev = getRequestByTimestamp(timestamp);
  if (prev == null) return;

  const nextRow = { ...prev, ...patch };
  delete (nextRow as { duration?: unknown }).duration;
  delete (nextRow as { budget?: unknown }).budget;
  if (!needsDeliveryFee(patch.how)) {
    nextRow.deliveryFee = null;
  }

  logRequestScheduleDebug('updateRequest (merged)', nextRow as Record<string, unknown>);

  const remoteId = getRequestSupabaseRowId(prev as Record<string, unknown>);
  if (remoteId != null && isSupabaseConfigured()) {
    const ok = await updateRequestInSupabase(remoteId, appRequestRowToPayload(nextRow as Record<string, unknown>));
    if (!ok) {
      throw new Error('Supabase request update failed');
    }
  }

  const next = useRequestsStore.getState().requests.map((r) => {
    if (r.timestamp !== timestamp) return r;
    return nextRow;
  });
  setRequests(next);
  touchLastActive();
}
