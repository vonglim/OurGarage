import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { useNotificationsStore } from '@/store/notificationsStore';
import { useMessageUnreadStore } from '@/store/messageUnreadStore';

export function startMessageUnreadSync(userId: string): () => void {
  const uid = userId.trim();
  if (__DEV__) {
    console.log('[messageUnreadSync] init called', {
      userId,
      trimmedUserId: uid,
      supabaseConfigured: isSupabaseConfigured(),
    });
  }
  if (!uid || !isSupabaseConfigured()) {
    if (__DEV__) {
      console.warn('[messageUnreadSync] init skipped', {
        hasUserId: Boolean(uid),
        supabaseConfigured: isSupabaseConfigured(),
      });
    }
    return () => {};
  }
  const supabase = getSupabase();
  const refreshNow = () => {
    if (__DEV__) console.log('[messageUnreadSync] refreshNow()');
    void useMessageUnreadStore.getState().refresh();
  };
  const refreshWithFollowUp = () => {
    // Follow-up refresh smooths eventual-consistency timing between inserts and rpc reads.
    if (__DEV__) console.log('[messageUnreadSync] refreshWithFollowUp()');
    refreshNow();
    setTimeout(refreshNow, 250);
  };
  if (__DEV__) console.log('[messageUnreadSync] hydrate()');
  void useMessageUnreadStore.getState().hydrate();

  const id =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const channel = supabase
    .channel(`message-unread:${uid}:${id}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'offer_messages', filter: `receiver_id=eq.${uid}` },
      (payload) => {
        if (__DEV__) {
          console.log('[messageUnreadSync] offer_messages event', {
            eventType: payload.eventType,
          });
        }
        refreshWithFollowUp();
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'conversation_reads', filter: `user_id=eq.${uid}` },
      (payload) => {
        if (__DEV__) {
          console.log('[messageUnreadSync] conversation_reads event', {
            eventType: payload.eventType,
          });
        }
        refreshWithFollowUp();
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
      (payload) => {
        const next = payload.new as { type?: unknown } | null;
        const prev = payload.old as { type?: unknown } | null;
        const tNew = String(next?.type ?? '');
        const tOld = String(prev?.type ?? '');
        // Alerts realtime is confirmed healthy in prod; use message notification events as sync signal.
        if (tNew === 'message' || tOld === 'message') {
          if (__DEV__) {
            console.log('[messageUnreadSync] notifications message event', {
              eventType: payload.eventType,
              tNew,
              tOld,
            });
          }
          refreshWithFollowUp();
        }
      }
    )
    .subscribe((status) => {
      if (__DEV__) {
        console.log('[messageUnreadSync] channel status', status);
      }
    });

  if (__DEV__) {
    console.log('[messageUnreadSync] subscriptions attached', { uid, channelId: id });
  }

  const unsubscribeNotificationsStore = useNotificationsStore.subscribe((state, prev) => {
    const nextUnreadMessageCount = state.notifications.filter(
      (n) => n.type === 'message' && !n.read && (n.forUserId == null || n.forUserId === '' || n.forUserId === uid)
    ).length;
    const prevUnreadMessageCount = prev.notifications.filter(
      (n) => n.type === 'message' && !n.read && (n.forUserId == null || n.forUserId === '' || n.forUserId === uid)
    ).length;
    if (nextUnreadMessageCount !== prevUnreadMessageCount) {
      if (__DEV__) {
        console.log('[messageUnreadSync] notifications store changed', {
          prevUnreadMessageCount,
          nextUnreadMessageCount,
        });
      }
      refreshWithFollowUp();
    }
  });

  return () => {
    if (__DEV__) console.log('[messageUnreadSync] cleanup', { uid, channelId: id });
    unsubscribeNotificationsStore();
    void supabase.removeChannel(channel);
  };
}
