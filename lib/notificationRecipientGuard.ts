import { getAuthUserIdSync } from '@/lib/authUser';

/**
 * For **locally created** notifications (e.g. `addNotification`) when the app might mistakenly
 * target the current user as "recipient" on the actor's device. Do **not** use this for
 * `addNotificationToStore` / server rows, where the recipient is the current user and must be applied.
 */
export function shouldBlockSelfNotificationToUserId(userId: string | null | undefined): boolean {
  const target = (userId ?? '').trim();
  const me = getAuthUserIdSync().trim();
  if (target === '' || me === '') {
    return false;
  }
  if (target !== me) {
    return false;
  }
  if (__DEV__) {
    console.warn(
      '[notifications] skipped: recipient user id would equal the current user (use explicit recipient, not self)'
    );
  }
  return true;
}
