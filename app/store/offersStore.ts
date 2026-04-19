import { create } from 'zustand';

import { getNumericOfferPrice } from '../lib/money';
import { getPublicProfileForView } from '../lib/mockPublicProfiles';
import { addNotification } from './notificationsStore';
import { getProfile, touchLastActive } from './profileStore';
import { getRequestByTimestamp, getRequests, requestAcceptsOffers } from './requestsStore';

export type Offer = {
  requestId: number;
  /** Optional note from the lender when bidding, or from the poster on a counter-offer. */
  message?: string;
  /** Optional: lender describes the tool being offered. */
  toolDescription?: string;
  timestamp: number;
  price: number;
  /** Who made the offer (this device user when submitting from Browse). */
  offerUserId?: string;
  offerUserName?: string;
  offerUserRating?: number;
  /** Snapshot avatar field (`preset:…` or image URI). */
  offerUserAvatar?: string;
  /** Snapshot for activity dot (simulated). */
  offerUserLastActive?: number;
  /** Poster declined this offer (hidden from list, kept in store). */
  declined?: boolean;
  /** True when this row is a new counter-offer from the request poster (append-only; does not replace lender offers). */
  counterFromPoster?: boolean;
};

type OffersStoreState = {
  offers: Offer[];
  appendOffer: (offer: Offer) => void;
  removeOffersByRequestId: (requestId: number) => void;
  markOfferDeclined: (requestId: number, offerTimestamp: number) => void;
};

export const useOffersStore = create<OffersStoreState>((set) => ({
  offers: [],
  appendOffer: (offer) =>
    set((s) => ({
      offers: [...s.offers, offer],
    })),
  removeOffersByRequestId: (requestId) =>
    set((s) => ({
      offers: s.offers.filter((o) => o.requestId !== requestId),
    })),
  markOfferDeclined: (requestId, offerTimestamp) =>
    set((s) => ({
      offers: s.offers.map((o) =>
        o.requestId === requestId && o.timestamp === offerTimestamp ? { ...o, declined: true } : o
      ),
    })),
}));

const DEV_PROVIDER_IDS = ['mock-neighbor-1', 'mock-neighbor-2', 'mock-neighbor-3'] as const;

/** Dev-only: fills up to 10 mock offers once (no-op in prod or if already ≥10). */
export function seedTestData(): void {
  if (!__DEV__) return;
  const { offers, appendOffer } = useOffersStore.getState();
  if (offers.length >= 10) return;

  const pendingRequestIds = getRequests()
    .map((r) => r.timestamp as number | undefined)
    .filter((ts): ts is number => typeof ts === 'number' && Number.isFinite(ts))
    .filter((ts) => requestAcceptsOffers(ts));
  if (pendingRequestIds.length === 0) return;

  const need = 10 - offers.length;
  const now = Date.now();

  for (let i = 0; i < need; i++) {
    const requestId = pendingRequestIds[Math.floor(Math.random() * pendingRequestIds.length)]!;
    const pid = DEV_PROVIDER_IDS[i % DEV_PROVIDER_IDS.length];
    const pub = getPublicProfileForView(pid);
    const price = 10 + Math.floor(Math.random() * 41);
    const rating = Math.round((3.5 + Math.random() * 1.5) * 10) / 10;
    appendOffer({
      requestId,
      timestamp: now - (need - i) * 73_321 - Math.floor(Math.random() * 5000),
      price,
      message: 'Available today',
      offerUserId: pid,
      offerUserName: `Provider ${(i % 3) + 1}`,
      offerUserRating: rating,
      offerUserAvatar: pub.avatar,
      offerUserLastActive: now - i * 60_000,
    });
  }
}

export function addOffer(
  requestId: number,
  opts?: { message?: string; price: number; toolDescription?: string }
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
  const profile = getProfile();
  const row: Offer = {
    requestId,
    timestamp: Date.now(),
    price: opts.price,
    offerUserId: profile.userId,
    offerUserName: profile.name.trim() || 'Neighbor',
    offerUserRating: 4.8,
    offerUserAvatar: profile.avatar,
    offerUserLastActive: profile.lastActive,
  };
  if (opts.message != null && opts.message !== '') row.message = opts.message;
  const desc = opts.toolDescription?.trim();
  if (desc) row.toolDescription = desc;
  useOffersStore.getState().appendOffer(row);
  touchLastActive();
  addNotification({
    type: 'offer',
      message: 'You received a new offer on an equipment request.',
    requestId,
  });
}

/** Poster sends a counter price/message; appends a new row (does not mutate existing offers). */
export function addPosterCounterOffer(
  requestId: number,
  opts: { price: number; message?: string }
): void {
  if (!requestAcceptsOffers(requestId)) return;
  const req = getRequestByTimestamp(requestId);
  const profile = getProfile();
  if (!req || req.posterUserId !== profile.userId) return;
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
    counterFromPoster: true,
    offerUserId: profile.userId,
    offerUserName: profile.name.trim() || 'You',
    offerUserRating: 4.8,
    offerUserAvatar: profile.avatar,
    offerUserLastActive: profile.lastActive,
  };
  const msg = typeof opts.message === 'string' ? opts.message.trim() : '';
  if (msg !== '') row.message = msg;
  useOffersStore.getState().appendOffer(row);
  touchLastActive();
}

/** Copy + sort: lowest price first, then higher rating (stable tie-breaker: original order). */
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
    .offers.filter((o) => o.requestId === requestId && !o.declined);
  return sortOffersForPoster(list);
}

export function getOfferByRequestAndOfferTimestamp(
  requestId: number,
  offerTimestamp: number
): Offer | undefined {
  return useOffersStore
    .getState()
    .offers.find((o) => o.requestId === requestId && o.timestamp === offerTimestamp);
}

export function countOffersForRequest(requestId: number): number {
  return useOffersStore
    .getState()
    .offers.filter((o) => o.requestId === requestId && !o.declined).length;
}

export function declineOffer(requestId: number, offerTimestamp: number): void {
  if (!requestAcceptsOffers(requestId)) return;
  useOffersStore.getState().markOfferDeclined(requestId, offerTimestamp);
}

export function removeOffersForRequest(requestId: number) {
  useOffersStore.getState().removeOffersByRequestId(requestId);
}

export function getOffers(): Offer[] {
  return [...useOffersStore.getState().offers];
}

/** Display name / id / rating / avatar for an offer row (legacy offers get a mock neighbor). */
export function getOfferUserPreview(offer: Offer): {
  userId: string;
  name: string;
  rating: number;
  avatar: string;
  lastActive: number;
} {
  if (
    typeof offer.offerUserId === 'string' &&
    offer.offerUserId.length > 0 &&
    typeof offer.offerUserName === 'string' &&
    offer.offerUserName.trim().length > 0
  ) {
    const pub = getPublicProfileForView(offer.offerUserId);
    const lastActive =
      typeof offer.offerUserLastActive === 'number' && Number.isFinite(offer.offerUserLastActive)
        ? offer.offerUserLastActive
        : pub.lastActive;
    const avatar =
      typeof offer.offerUserAvatar === 'string' && offer.offerUserAvatar.trim().length > 0
        ? offer.offerUserAvatar.trim()
        : pub.avatar;
    return {
      userId: offer.offerUserId,
      name: offer.offerUserName.trim(),
      rating:
        typeof offer.offerUserRating === 'number' && Number.isFinite(offer.offerUserRating)
          ? offer.offerUserRating
          : 4.8,
      avatar,
      lastActive,
    };
  }
  const i = Math.abs(Math.floor(offer.timestamp)) % 3;
  const ids = ['mock-neighbor-1', 'mock-neighbor-2', 'mock-neighbor-3'] as const;
  const names = ['Jordan Lee', 'Sam Rivera', 'Taylor Kim'] as const;
  const ratings = [4.9, 4.7, 5.0] as const;
  const userId = ids[i];
  const pub = getPublicProfileForView(userId);
  return {
    userId,
    name: names[i],
    rating: ratings[i],
    avatar: pub.avatar,
    lastActive: pub.lastActive,
  };
}
