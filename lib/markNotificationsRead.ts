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

/** Marks all non-message notifications read; message notifications stay unread until thread open. */
export async function markAllServerNonMessageNotificationsAsReadForCurrentUser(): Promise<void> {
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
    .eq('read', false)
    .neq('type', 'message');
  if (error != null && __DEV__) {
    console.warn('[notifications] bulk non-message mark read failed:', error.message);
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
  if (__DEV__) {
    console.log('[UNREAD CLEAR] reason=mark_all_notifications scope=all screen=activity');
  }
  useNotificationsStore.getState().markAllAsRead();
  void markAllServerNotificationsAsReadForCurrentUser();
}

/** Activity uses this to clear alerts without clearing unread chat/message indicators. */
export function markAllNonMessageNotificationsAsRead(): void {
  if (__DEV__) {
    console.log('[UNREAD CLEAR] reason=mark_all_notifications scope=non_message screen=activity');
  }
  useNotificationsStore.getState().markAllAsReadExceptMessages();
  void markAllServerNonMessageNotificationsAsReadForCurrentUser();
}

/** One row: local first, then server for persisted UUID ids. */
export function markNotificationAsRead(notificationId: string): void {
  if (__DEV__) {
    console.log('[UNREAD CLEAR] reason=mark_single_notification notificationId=', notificationId);
  }
  useNotificationsStore.getState().markAsRead(notificationId);
  void markSingleServerNotificationAsReadForCurrentUser(notificationId);
}
