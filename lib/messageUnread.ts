import { getAuthUserIdSync } from '@/lib/authUser';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { useNotificationsStore } from '@/store/notificationsStore';

function unreadFromNotificationsFallback(me: string): Record<string, number> {
  const notifications = useNotificationsStore.getState().notifications;
  const out: Record<string, number> = {};
  for (const n of notifications) {
    if (n.type !== 'message') continue;
    if (n.read) continue;
    if (n.forUserId && n.forUserId !== me) continue;
    const offerId = String(n.offerId ?? '').trim();
    if (!offerId) continue;
    out[offerId] = (out[offerId] ?? 0) + 1;
  }
  if (__DEV__) {
    console.log('[messageUnread] fallback totals from notifications store', out);
  }
  return out;
}

export async function fetchUnreadMessageCountsByOffer(): Promise<Record<string, number>> {
  if (!isSupabaseConfigured()) return {};
  const me = getAuthUserIdSync().trim();
  if (!me) return {};
  if (__DEV__) console.log('[messageUnread] rpc start unread_message_counts_for_user', { me });
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('unread_message_counts_for_user');
  if (error) {
    if (__DEV__) console.warn('[messageUnread] unread_message_counts_for_user failed', error.message);
    if (/Could not find the function/i.test(error.message)) {
      return unreadFromNotificationsFallback(me);
    }
    return {};
  }
  const out: Record<string, number> = {};
  for (const row of (data ?? []) as { offer_id?: string; unread_count?: number | string }[]) {
    const offerId = String(row.offer_id ?? '').trim();
    const nRaw = row.unread_count;
    const n = typeof nRaw === 'number' ? nRaw : Number(nRaw ?? 0);
    if (offerId && Number.isFinite(n) && n > 0) out[offerId] = Math.floor(n);
  }
  if (__DEV__) console.log('[messageUnread] rpc result unread totals', out);
  return out;
}

export async function markOfferThreadRead(offerId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const id = offerId.trim();
  if (!id) return;
  const supabase = getSupabase();
  if (__DEV__) {
    console.log('[UNREAD CLEAR] reason=thread_open scope=offer_thread offerId=', id, 'screen=chat');
    console.log('[messageUnread] mark_offer_thread_read start', { offerId: id });
  }
  const { error } = await supabase.rpc('mark_offer_thread_read', { p_offer_id: id });
  if (error && __DEV__) {
    console.warn('[messageUnread] mark_offer_thread_read failed', error.message);
  }
  if (!error && __DEV__) console.log('[messageUnread] mark_offer_thread_read ok', { offerId: id });
}

export async function markMessageNotificationsForOfferAsRead(offerId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const me = getAuthUserIdSync().trim();
  const id = offerId.trim();
  if (!me || !id) return;
  if (__DEV__) {
    console.log('[UNREAD CLEAR] reason=thread_open scope=message_notifications offerId=', id, 'screen=chat');
  }
  const supabase = getSupabase();
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', me)
    .eq('type', 'message')
    .eq('offer_id', id)
    .eq('read', false);
  if (error && __DEV__) {
    console.warn('[messageUnread] mark message notifications read failed', error.message);
  }
  useNotificationsStore.setState((state) => ({
    notifications: state.notifications.map((n) =>
      n.type === 'message' && n.offerId === id ? { ...n, read: true } : n
    ),
  }));
}
