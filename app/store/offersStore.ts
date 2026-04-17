import { requestAcceptsOffers } from './requestsStore';

export type Offer = {
  requestId: number;
  message?: string;
  timestamp: number;
  price: number;
};

let offers: Offer[] = [];

export function addOffer(
  requestId: number,
  opts?: { message?: string; price: number }
) {
  if (!requestAcceptsOffers(requestId)) return;
  if (
    opts == null ||
    typeof opts.price !== 'number' ||
    !Number.isFinite(opts.price) ||
    opts.price < 0
  ) {
    return;
  }
  const row: Offer = {
    requestId,
    timestamp: Date.now(),
    price: opts.price,
  };
  if (opts.message != null && opts.message !== '') row.message = opts.message;
  offers.push(row);
}

export function getOffersForRequest(requestId: number): Offer[] {
  return offers
    .filter((o) => o.requestId === requestId)
    .sort((a, b) => b.timestamp - a.timestamp);
}

export function countOffersForRequest(requestId: number): number {
  return offers.filter((o) => o.requestId === requestId).length;
}

export function removeOffersForRequest(requestId: number) {
  offers = offers.filter((o) => o.requestId !== requestId);
}

export function getOffers(): Offer[] {
  return [...offers];
}
