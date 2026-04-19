import { create } from 'zustand';

import type { HowKey } from '../lib/deliveryFormat';
import type { DurationType } from '../lib/durationFormat';
import { needsDeliveryFee } from '../lib/deliveryFormat';
import { addNotification } from './notificationsStore';
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

export function requestAcceptsOffers(timestamp: number): boolean {
  const r = getRequestByTimestamp(timestamp);
  if (!r) return false;
  return getEffectiveRentalStatus(r) === 'pending';
}

export function acceptOfferForRequest(
  requestTimestamp: number,
  acceptedOfferTimestamp: number,
  acceptedPrice: number
) {
  const before = getRequestByTimestamp(requestTimestamp);
  if (!before || before.matched === true) return;

  const requests = useRequestsStore.getState().requests.map((r) => {
    if (r.timestamp !== requestTimestamp || r.matched) return r;
    const price = Number.isFinite(acceptedPrice) ? acceptedPrice : 0;
    return {
      ...r,
      matched: true,
      fulfilled: false,
      rentalStatus: 'matched' satisfies RentalStatus,
      acceptedOfferTimestamp,
      acceptedPrice: price,
    };
  });
  setRequests(requests);

  const after = getRequestByTimestamp(requestTimestamp);
  if (before && !before.matched && after?.matched) {
    addNotification({
      type: 'accepted',
      message: 'Your offer was accepted\nComplete your rental to continue',
      requestId: requestTimestamp,
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
  const before = getRequestByTimestamp(requestTimestamp);
  const next = useRequestsStore.getState().requests.map((r) => {
    if (r.timestamp !== requestTimestamp || !r.matched) return r;
    if (getEffectiveRentalStatus(r) !== 'active') return r;
    return { ...r, fulfilled: true, rentalStatus: 'completed' satisfies RentalStatus };
  });
  setRequests(next);

  const after = getRequestByTimestamp(requestTimestamp);
  if (
    before?.matched &&
    before.fulfilled !== true &&
    after?.fulfilled === true
  ) {
    addNotification({
      type: 'completed',
      message: 'A rental was marked completed.',
      requestId: requestTimestamp,
    });
  }
}

/** After handoff checklist: records start time and marks rental active (in-app only). */
export function confirmRentalHandoff(requestTimestamp: number): void {
  const before = getRequestByTimestamp(requestTimestamp);
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

  const after = getRequestByTimestamp(requestTimestamp);
  if (before?.rentalStart == null && after?.rentalStart != null) {
    addNotification({
      type: 'started',
      message: 'Rental started after handoff confirmation.',
      requestId: requestTimestamp,
    });
  }
}

export function addRequest(request: any) {
  const copy = { ...request };
  delete copy.duration;
  delete copy.budget;
  const posterUserId = getProfile().userId;
  const row = {
    ...copy,
    matched: false,
    timestamp: Date.now(),
    posterUserId,
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

const DEV_SEED_TOOL_NAMES = [
  'Drill',
  'Circular Saw',
  'Ladder',
  'Impact Driver',
  'Shop Vac',
  'Pressure Washer',
  'Tile Saw',
  'Hammer Drill',
  'Miter Saw',
  'Jackhammer',
] as const;

/** Dev-only: replaces prior dev-seeded rows, then fills up to 10 mock requests. */
export function seedTestData(): void {
  if (!__DEV__) return;

  const now = Date.now();
  const expiresAt = now + 1000 * 60 * 60 * 24;
  const posterUserId = getProfile().userId;

  const kept = useRequestsStore.getState().requests.filter((r) => !r.devSeedId);
  useRequestsStore.setState({ requests: kept });

  const current = useRequestsStore.getState().requests;
  if (current.length >= 10) return;

  const need = 10 - current.length;
  const appended: any[] = [];

  for (let i = 0; i < need; i++) {
    const id = `req-seed-${now}-${i}`;
    const timestamp = now - i * 97_654 - Math.floor(Math.random() * 10_000);
    appended.push({
      id,
      toolName: DEV_SEED_TOOL_NAMES[i % DEV_SEED_TOOL_NAMES.length],
      description: 'Need for project',
      createdAt: now - i * 30_000,
      status: 'active',
      expiresAt,
      when: ['Today', 'This Weekend', 'Flexible'][i % 3] as string,
      how: (i % 2 === 0 ? 'pickup_nearby' : 'delivery_only') as HowKey,
      pickupRadiusMiles: 10,
      durationType: 'multiDay' as DurationType,
      durationValue: 2,
      totalPrice: 20 + (i % 6) * 5,
      deliveryFee: null,
      location: `9410${i % 10} USA`,
      requestLat: null,
      requestLng: null,
      matched: false,
      fulfilled: false,
      timestamp,
      posterUserId,
      rentalStatus: 'pending' satisfies RentalStatus,
      devSeedId: id,
    });
  }
  useRequestsStore.setState((s) => ({ requests: [...s.requests, ...appended] }));
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
