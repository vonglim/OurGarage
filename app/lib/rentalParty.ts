import {
  getPublicProfileForView,
  posterUserIdFromRequest,
} from './mockPublicProfiles';
import {
  getOfferByRequestAndOfferTimestamp,
  getOfferUserPreview,
} from '../store/offersStore';
import { getProfile } from '../store/profileStore';

/** Display name of the counterparty (poster vs accepted offerer) for the current user. */
export function getOtherPartyDisplayName(request: {
  timestamp: number;
  posterUserId?: string;
  matched?: boolean;
  acceptedOfferTimestamp?: number | null;
}): string {
  const me = getProfile().userId;
  const posterId =
    typeof request.posterUserId === 'string' && request.posterUserId.length > 0
      ? request.posterUserId
      : posterUserIdFromRequest(request.timestamp);
  if (!request.matched || request.acceptedOfferTimestamp == null) return '—';
  const offer = getOfferByRequestAndOfferTimestamp(
    request.timestamp,
    request.acceptedOfferTimestamp
  );
  if (!offer) return '—';
  const preview = getOfferUserPreview(offer);
  if (me === posterId) return preview.name.trim() || 'Neighbor';
  if (me === preview.userId) {
    return getPublicProfileForView(posterId).name.trim() || 'Poster';
  }
  return preview.name.trim() || '—';
}
