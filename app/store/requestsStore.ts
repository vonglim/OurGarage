import type { HowKey } from '../lib/deliveryFormat';
import type { DurationType } from '../lib/durationFormat';
import { needsDeliveryFee } from '../lib/deliveryFormat';
import { addNotification } from './notificationsStore';
import { touchLastActive } from './profileStore';

let requests: any[] = [];

export function getRequestByTimestamp(timestamp: number) {
  return requests.find((r) => r.timestamp === timestamp);
}

export function requestAcceptsOffers(timestamp: number): boolean {
  const r = getRequestByTimestamp(timestamp);
  if (!r) return false;
  return !r.matched;
}

export function acceptOfferForRequest(
  requestTimestamp: number,
  acceptedOfferTimestamp: number,
  acceptedPrice: number
) {
  const before = getRequestByTimestamp(requestTimestamp);
  requests = requests.map((r) => {
    if (r.timestamp !== requestTimestamp || r.matched) return r;
    const price = Number.isFinite(acceptedPrice) ? acceptedPrice : 0;
    return {
      ...r,
      matched: true,
      fulfilled: false,
      acceptedOfferTimestamp,
      acceptedPrice: price,
    };
  });
  const after = getRequestByTimestamp(requestTimestamp);
  if (before && !before.matched && after?.matched) {
    addNotification({
      type: 'accepted',
      message: 'An offer was accepted. Complete the rental agreement to continue.',
      requestId: requestTimestamp,
    });
  }
}

/** Matched + not explicitly waiting on “Mark as Completed” (legacy rows have no `fulfilled`). */
export function isLeaveReviewEligible(req: { matched?: boolean; fulfilled?: boolean }): boolean {
  if (!req?.matched) return false;
  if (req.fulfilled === false) return false;
  return true;
}

export function showMarkRentalComplete(req: { matched?: boolean; fulfilled?: boolean }): boolean {
  return !!req?.matched && req.fulfilled === false;
}

export function markRequestRentalComplete(requestTimestamp: number): void {
  const before = getRequestByTimestamp(requestTimestamp);
  requests = requests.map((r) =>
    r.timestamp === requestTimestamp && r.matched ? { ...r, fulfilled: true } : r
  );
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
  requests = requests.map((r) => {
    if (r.timestamp !== requestTimestamp || !r.matched) return r;
    if (r.rentalStart != null) return r;
    return { ...r, rentalStart: now, rentalActive: true };
  });
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
  requests.push({
    ...copy,
    matched: false,
    timestamp: Date.now(),
  });
  touchLastActive();
}

export function getRequests() {
  return requests.sort((a, b) => b.timestamp - a.timestamp);
}

export function removeRequest(timestamp: number) {
  requests = requests.filter((r) => r.timestamp !== timestamp);
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
  requests = requests.map((r) => {
    if (r.timestamp !== timestamp) return r;
    const next = { ...r, ...patch };
    delete next.duration;
    delete next.budget;
    if (!needsDeliveryFee(patch.how)) {
      next.deliveryFee = null;
    }
    return next;
  });
}
