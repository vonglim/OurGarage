import { useSyncExternalStore } from 'react';

import { getProfileCacheVersionSnapshot, subscribeToProfileCache } from '@/lib/remoteProfileCache';

/** Re-render when remote profile `name` cache updates (e.g. after batch fetch). */
export function useProfileCacheVersion(): number {
  return useSyncExternalStore(
    subscribeToProfileCache,
    getProfileCacheVersionSnapshot,
    getProfileCacheVersionSnapshot
  );
}
