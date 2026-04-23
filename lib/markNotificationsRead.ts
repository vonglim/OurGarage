import { getAuthUserIdSync } from '@/lib/authUser';
import { isUuidString } from '@/lib/requestOwnership';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { useNotificationsStore } from '@/store/notificationsStore';

/**
 * `update notifications set read = true where user_id = current and read = false` via Supabase.
 */
export async function markAllServerNotificationsAsReadForCurrentUser(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const me = getAuthUserIdSync().trim();
  if (me === '' || !isUuidString(me)) {
    return;
  }
  const supabase = getSupabase();
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', me)
    .eq('read', false);
  if (error != null && __DEV__) {
    console.warn('[notifications] bulk mark read failed:', error.message);
  }
}

/**
 * `update notifications set read = true where id = :id` (and `user_id` = current) via Supabase.
 * Local-only ids (e.g. `notif_*`) are skipped on the server.
 */
export async function markSingleServerNotificationAsReadForCurrentUser(
  notificationId: string
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const id = notificationId.trim();
  if (id === '' || !isUuidString(id)) {
    return;
  }
  const supabase = getSupabase();
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', id);
  if (error != null && __DEV__) {
    console.warn('[notifications] single mark read failed:', error.message);
  }
}

/** Marks every local row read and runs the bulk server update (e.g. Activity screen). */
export function markAllNotificationsAsRead(): void {
  useNotificationsStore.getState().markAllAsRead();
  void markAllServerNotificationsAsReadForCurrentUser();
}

/** One row: local first, then server for persisted UUID ids. */
export function markNotificationAsRead(notificationId: string): void {
  useNotificationsStore.getState().markAsRead(notificationId);
  void markSingleServerNotificationAsReadForCurrentUser(notificationId);
}
