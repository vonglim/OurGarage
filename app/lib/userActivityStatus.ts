/**
 * “Recently active” window: midpoint between 15 and 30 minutes (no real-time sync yet).
 */
export const ACTIVE_WINDOW_MS = 22.5 * 60 * 1000;

export type UserActivityStatus = 'active' | 'inactive';

export function getUserActivityStatus(
  lastActive: number | null | undefined
): UserActivityStatus {
  if (lastActive == null || !Number.isFinite(lastActive)) return 'inactive';
  return Date.now() - lastActive <= ACTIVE_WINDOW_MS ? 'active' : 'inactive';
}

export function activityDotColor(status: UserActivityStatus): string {
  return status === 'active' ? '#2E7D32' : '#9E9E9E';
}
