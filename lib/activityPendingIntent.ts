import AsyncStorage from '@react-native-async-storage/async-storage';

export const ACTIVITY_PENDING_INTENT_STORAGE_KEY = 'activity_pending_intent_v1';

/** Where to scroll after opening Activity (unified rental areas in the single-page layout). */
export type ActivityScrollTarget = 'renter_rentals' | 'owner_rentals';

export type ActivityPendingIntentV2 = {
  version: 2;
  scrollTo: ActivityScrollTarget;
};

/**
 * Set synchronously when scheduling a Rentals deep-link so Activity hydration can avoid
 * racing with `useFocusEffect` consumers of storage.
 */
export const activityRentalsIntentPendingSyncRef = { current: false };

export async function scheduleActivityRentalsIntent(
  rentalsSub: 'renting' | 'listing'
): Promise<void> {
  activityRentalsIntentPendingSyncRef.current = true;
  const scrollTo: ActivityScrollTarget = rentalsSub === 'renting' ? 'renter_rentals' : 'owner_rentals';
  const payload: ActivityPendingIntentV2 = { version: 2, scrollTo };
  try {
    await AsyncStorage.setItem(ACTIVITY_PENDING_INTENT_STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    activityRentalsIntentPendingSyncRef.current = false;
    throw err;
  }
}

export async function readAndClearActivityPendingIntent(): Promise<ActivityPendingIntentV2 | null> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVITY_PENDING_INTENT_STORAGE_KEY);
    if (raw == null || raw === '') return null;
    await AsyncStorage.removeItem(ACTIVITY_PENDING_INTENT_STORAGE_KEY);
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;

    const version = (parsed as { version?: unknown }).version;
    if (version === 2) {
      const scrollTo = (parsed as { scrollTo?: unknown }).scrollTo;
      if (scrollTo === 'renter_rentals' || scrollTo === 'owner_rentals') {
        return { version: 2, scrollTo };
      }
      return null;
    }

    // Legacy: { tab: 'rentals', rentalsSub: 'renting' | 'listing' }
    const tab = (parsed as { tab?: unknown }).tab;
    const rentalsSub = (parsed as { rentalsSub?: unknown }).rentalsSub;
    if (tab === 'rentals' && (rentalsSub === 'renting' || rentalsSub === 'listing')) {
      return {
        version: 2,
        scrollTo: rentalsSub === 'renting' ? 'renter_rentals' : 'owner_rentals',
      };
    }
    return null;
  } catch {
    return null;
  }
}
