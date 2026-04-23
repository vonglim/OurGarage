import type { RealtimePostgresInsertPayload, RealtimeChannel } from '@supabase/supabase-js';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  addNotificationToStore,
  useNotificationsStore,
  type AppNotification,
  type AppNotificationType,
} from '@/store/notificationsStore';

const SERVER_TYPE_TO_APP: Record<string, AppNotificationType> = {
  new_message: 'message',
  new_offer: 'new_offer',
  offer_accepted: 'offer_accepted',
  counter_offer: 'counter_offer',
  agreement_pending: 'agreement_pending',
};

function mapServerType(raw: string): AppNotificationType {
  const t = SERVER_TYPE_TO_APP[raw];
  if (t) return t;
  if (raw === 'message') return 'message';
  if (raw === 'review' || raw === 'completed' || raw === 'started' || raw === 'declined') {
    return raw;
  }
  return 'message';
}

function asMessage(title: string | null | undefined, body: string | null | undefined): string {
  const t = (title ?? '').trim();
  const b = (body ?? '').trim();
  if (t && b) return `${t}\n${b}`;
  if (b) return b;
  if (t) return t;
  return '';
}

/**
 * Maps a `public.notifications` row to an {@link AppNotification} for the local store.
 */
export function mapSupabaseNotificationToApp(
  record: Record<string, unknown>,
  forUserId: string
): AppNotification | null {
  const id = record.id != null ? String(record.id) : '';
  if (id === '') return null;

  const st = record.type;
  if (typeof st !== 'string' || st === '') return null;

  const title = record.title;
  const body = record.body;
  const tStr = typeof title === 'string' ? title : '';
  const bStr = typeof body === 'string' ? body : '';

  const created = record.created_at;
  const timestamp =
    typeof created === 'string'
      ? new Date(created).getTime()
      : typeof created === 'number' && Number.isFinite(created)
        ? created
        : Date.now();

  const read = record.read === true;

  const req = record.request_id;
  const requestId =
    req != null && (typeof req === 'string' || typeof req === 'number')
      ? (typeof req === 'number' ? req : req.trim() !== '' ? req.trim() : null)
      : null;

  const off = record.offer_id;
  const offerId = typeof off === 'string' && off.trim() !== '' ? off.trim() : null;

  let chatId: string | null = null;
  const data = record.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const d = data as Record<string, unknown>;
    if (typeof d.chatId === 'string' && d.chatId.trim() !== '') chatId = d.chatId.trim();
  }

  return {
    id,
    type: mapServerType(st),
    message: asMessage(tStr, bStr),
    timestamp,
    read,
    requestId: requestId as string | number | null,
    offerId,
    chatId,
    forUserId: (forUserId || '').trim() || null,
  };
}

/**
 * Await local hydrate, load existing server rows for this user, then open a realtime
 * `INSERT` subscription. Returns an unsubscribe to stop listening (e.g. on sign out).
 */
export function startNotificationsServerSync(userId: string): () => void {
  if (!isSupabaseConfigured() || !userId.trim()) {
    return () => undefined;
  }

  const currentUserId = userId.trim();
  const supabase = getSupabase();
  let cancelled = false;
  let channel: RealtimeChannel | null = null;

  void (async () => {
    await useNotificationsStore.getState().hydrate();
    if (cancelled) return;

    const { data, error } = await supabase
      .from('notifications')
      .select(
        'id, user_id, type, title, body, data, read, request_id, offer_id, created_at'
      )
      .eq('user_id', currentUserId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error != null) {
      if (__DEV__) {
        console.warn('[notifications] initial fetch failed:', error.message);
      }
    } else if (data != null && !cancelled) {
      for (const row of data) {
        const n = mapSupabaseNotificationToApp(
          row as unknown as Record<string, unknown>,
          currentUserId
        );
        if (n) addNotificationToStore(n);
      }
    }
    if (cancelled) return;

    channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
        },
        (payload: RealtimePostgresInsertPayload<Record<string, unknown>>) => {
          console.log('NEW NOTIFICATION RECEIVED', payload);
          const row = payload.new;
          if (row == null || typeof row !== 'object') return;
          const r = row as Record<string, unknown>;
          if (r.user_id == null) return;
          if (String(r.user_id) !== currentUserId) return;
          const n = mapSupabaseNotificationToApp(r, currentUserId);
          if (n) {
            addNotificationToStore(n);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('NOTIFICATION SUBSCRIBED');
        }
      });
  })();

  return () => {
    cancelled = true;
    if (channel) {
      void supabase.removeChannel(channel);
    }
  };
}
