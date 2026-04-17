import type { HowKey } from '../lib/deliveryFormat';
import type { DurationType } from '../lib/durationFormat';
import { needsDeliveryFee } from '../lib/deliveryFormat';

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
  requests = requests.map((r) =>
    r.timestamp === requestTimestamp && r.matched ? { ...r, fulfilled: true } : r
  );
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
