import { getProfile, touchLastActive } from './profileStore';
import { getPublicProfileForView } from '../lib/mockPublicProfiles';
import { addNotification } from './notificationsStore';
import { requestAcceptsOffers } from './requestsStore';

export type Offer = {
  requestId: number;
  message?: string;
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
  offers.push(row);
  touchLastActive();
  addNotification({
    type: 'offer',
    message: 'You received a new offer on a tool request.',
    requestId,
  });
}

export function getOffersForRequest(requestId: number): Offer[] {
  return offers
    .filter((o) => o.requestId === requestId)
    .sort((a, b) => b.timestamp - a.timestamp);
}

export function getOfferByRequestAndOfferTimestamp(
  requestId: number,
  offerTimestamp: number
): Offer | undefined {
  return offers.find((o) => o.requestId === requestId && o.timestamp === offerTimestamp);
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
