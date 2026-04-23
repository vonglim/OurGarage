import { getRequestOwnerId } from './requestOwnership';
import { getProfileNameForUserId } from './profileDisplayName';
import { getPublicProfileForView } from './publicProfiles';
import { getOfferById, getOfferUserPreview } from '@/store/offersStore';
import { getAuthUserIdSync } from './authUser';

/** Display name of the counterparty (poster vs accepted offerer) for the current user. */
export function getOtherPartyDisplayName(request: {
  timestamp: number;
  posterUserId?: string;
  matched?: boolean;
  acceptedOfferId?: string | null;
}): string {
  const me = getAuthUserIdSync();
  const posterId = getRequestOwnerId(request as Record<string, unknown>) ?? '';
  if (posterId === '') return '—';
  if (!request.matched || request.acceptedOfferId == null || request.acceptedOfferId === '') {
    return '—';
  }
  const offer = getOfferById(String(request.acceptedOfferId));
  if (!offer) return '—';
  const preview = getOfferUserPreview(offer);
  if (me === posterId) {
    return preview.name.trim() || getProfileNameForUserId(preview.userId);
  }
  if (me === preview.userId) {
    return getProfileNameForUserId(posterId);
  }
  return preview.name.trim() || '—';
}

/** Name + rating for the counterparty on a matched request (e.g. active rental card). */
export function getOtherPartyRentalPreview(request: {
  timestamp: number;
  posterUserId?: string;
  matched?: boolean;
  acceptedOfferId?: string | null;
}): { name: string; rating: number } | null {
  const me = getAuthUserIdSync();
  const posterId = getRequestOwnerId(request as Record<string, unknown>) ?? '';
  if (posterId === '') return null;
  if (!request.matched || request.acceptedOfferId == null || request.acceptedOfferId === '') {
    return null;
  }
  const offer = getOfferById(String(request.acceptedOfferId));
  if (!offer) return null;
  const offerPreview = getOfferUserPreview(offer);
  if (me === posterId) {
    return {
      name: offerPreview.name.trim() || getProfileNameForUserId(offerPreview.userId),
      rating: offerPreview.rating,
    };
  }
  if (me === offerPreview.userId) {
    return {
      name: getProfileNameForUserId(posterId),
      rating: getPublicProfileForView(posterId).ratingNumber,
    };
  }
  return {
    name: offerPreview.name.trim() || '—',
    rating: offerPreview.rating,
  };
}
