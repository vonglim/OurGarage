import { formatPresetAvatar } from './profileAvatar';
import { getAuthUserIdSync } from './authUser';
import { getProfileNameForUserId } from './profileDisplayName';

export type PublicProfileView = {
  userId: string;
  name: string;
  bio: string;
  avatar: string;
  ratingNumber: number;
  ratingStars: string;
  lastActive: number;
};

function basePublicProfile(userId: string): Omit<PublicProfileView, 'lastActive'> {
  return {
    userId,
    name: getProfileNameForUserId(userId),
    bio: '',
    avatar: formatPresetAvatar('person'),
    ratingNumber: 0,
    ratingStars: '—',
  };
}

export function isOwnProfileUserId(userId: string | undefined): boolean {
  if (userId == null || userId.trim() === '') return false;
  return userId === getAuthUserIdSync();
}

export function getPublicProfileForView(userId: string): PublicProfileView {
  if (!userId.trim()) {
    return {
      userId: '',
      name: '—',
      bio: '',
      avatar: formatPresetAvatar('person'),
      ratingNumber: 0,
      ratingStars: '—',
      lastActive: Date.now(),
    };
  }
  const uid = userId.trim();
  return { ...basePublicProfile(uid), lastActive: Date.now() };
}
