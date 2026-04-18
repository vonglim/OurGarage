import { formatPresetAvatar } from './profileAvatar';
import { getProfile } from '../store/profileStore';

export type PublicProfileView = {
  userId: string;
  name: string;
  bio: string;
  avatar: string;
  ratingNumber: number;
  ratingStars: string;
  /** Simulated last-seen (no real-time presence). */
  lastActive: number;
};

type PublicProfileBase = Omit<PublicProfileView, 'lastActive'>;

const MOCK_BY_ID: Record<string, PublicProfileBase> = {
  'mock-neighbor-1': {
    userId: 'mock-neighbor-1',
    name: 'Jordan Lee',
    bio: 'Weekend DIYer. Happy to lend tools nearby.',
    avatar: formatPresetAvatar('hammer'),
    ratingNumber: 4.9,
    ratingStars: '★★★★★',
  },
  'mock-neighbor-2': {
    userId: 'mock-neighbor-2',
    name: 'Sam Rivera',
    bio: 'Garage workshop, flexible pickup times.',
    avatar: formatPresetAvatar('rocket'),
    ratingNumber: 4.7,
    ratingStars: '★★★★☆',
  },
  'mock-neighbor-3': {
    userId: 'mock-neighbor-3',
    name: 'Taylor Kim',
    bio: 'Tools kept clean and ready to go.',
    avatar: formatPresetAvatar('leaf'),
    ratingNumber: 5.0,
    ratingStars: '★★★★★',
  },
};

/** Mock “last seen” for public profiles (refreshed on each read). */
function mockLastActiveForUserId(userId: string): number {
  const now = Date.now();
  if (userId === 'mock-neighbor-1') return now - 10 * 60 * 1000;
  if (userId === 'mock-neighbor-2') return now - 4 * 60 * 60 * 1000;
  if (userId === 'mock-neighbor-3') return now - 18 * 60 * 1000;
  const n = Math.abs(userId.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % 5;
  return now - (40 + n * 22) * 60 * 1000;
}

function fallbackBaseFromId(userId: string): PublicProfileBase {
  const n = Math.abs(userId.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % 3;
  const names = ['Alex Morgan', 'Casey Ng', 'Riley Park'];
  const bios = [
    'Neighbor on OurGarage.',
    'Local tool lender.',
    'Community rentals.',
  ];
  return {
    userId,
    name: names[n],
    bio: bios[n],
    avatar: formatPresetAvatar((['person', 'hammer', 'rocket'] as const)[n]),
    ratingNumber: 4.6 + n * 0.1,
    ratingStars: '★★★★☆',
  };
}

const POSTER_IDS = ['mock-neighbor-1', 'mock-neighbor-2', 'mock-neighbor-3'] as const;

/** Deterministic mock poster id for a request listing (no backend). */
export function posterUserIdFromRequest(timestamp: number | null | undefined): string {
  const t = timestamp ?? 0;
  return POSTER_IDS[Math.abs(Math.floor(t)) % POSTER_IDS.length];
}

export function isOwnProfileUserId(userId: string | undefined): boolean {
  if (userId == null || userId === '') return true;
  return userId === getProfile().userId;
}

/** Profile data for hero + identity when viewing someone else (or fallback for unknown ids). */
export function getPublicProfileForView(userId: string): PublicProfileView {
  const base = MOCK_BY_ID[userId] ?? fallbackBaseFromId(userId);
  return { ...base, lastActive: mockLastActiveForUserId(userId) };
}
