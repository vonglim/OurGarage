import { getAuthUserIdSync } from '@/lib/authUser';

/**
 * Returns true if we should skip sending: the intended recipient is the current device user.
 * In-app and server notifs are always to the *other* party.
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
