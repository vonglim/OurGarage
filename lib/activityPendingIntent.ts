import AsyncStorage from '@react-native-async-storage/async-storage';

export const ACTIVITY_PENDING_INTENT_STORAGE_KEY = 'activity_pending_intent_v1';

export type ActivityRentalsSubIntent = {
  tab: 'rentals';
  rentalsSub: 'renting' | 'listing';
};

/**
 * Set synchronously when scheduling a Rentals deep-link so Activity hydration can avoid
 * overwriting `tab` before `useFocusEffect` consumes storage.
 */
export const activityRentalsIntentPendingSyncRef = { current: false };

export async function scheduleActivityRentalsIntent(
  rentalsSub: 'renting' | 'listing'
): Promise<void> {
  activityRentalsIntentPendingSyncRef.current = true;
  const payload: ActivityRentalsSubIntent = { tab: 'rentals', rentalsSub };
  try {
    await AsyncStorage.setItem(ACTIVITY_PENDING_INTENT_STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    activityRentalsIntentPendingSyncRef.current = false;
    throw err;
  }
}

export async function readAndClearActivityPendingIntent(): Promise<ActivityRentalsSubIntent | null> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVITY_PENDING_INTENT_STORAGE_KEY);
    if (raw == null || raw === '') return null;
    await AsyncStorage.removeItem(ACTIVITY_PENDING_INTENT_STORAGE_KEY);
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const tab = (parsed as { tab?: unknown }).tab;
    const rentalsSub = (parsed as { rentalsSub?: unknown }).rentalsSub;
    if (tab !== 'rentals') return null;
    if (rentalsSub !== 'renting' && rentalsSub !== 'listing') return null;
    return { tab: 'rentals', rentalsSub };
  } catch {
    return null;
  }
}
