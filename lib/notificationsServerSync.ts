import type {
  RealtimeChannel,
  RealtimePostgresInsertPayload,
  RealtimePostgresUpdatePayload,
} from '@supabase/supabase-js';
import { REALTIME_SUBSCRIBE_STATES } from '@supabase/realtime-js';
import { Platform } from 'react-native';

import { getAuthUserIdSync } from '@/lib/authUser';
import { getActiveChatOfferThreadId } from '@/lib/activeChatOfferThread';
import { isUuidString } from '@/lib/requestOwnership';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { presentLocalChatBanner } from '@/lib/notifications';
import {
  addNotificationToStore,
  replaceNotificationInStore,
  useNotificationsStore,
  type AppNotification,
  type AppNotificationType,
} from '@/store/notificationsStore';
import { useUnifiedRentalsActivityStore } from '@/store/unifiedRentalsActivityStore';

const SERVER_TYPE_TO_APP: Record<string, AppNotificationType> = {
  new_message: 'message',
  new_offer: 'new_offer',
  offer_created: 'new_offer',
  offer_updated: 'new_offer',
  offer_accepted: 'offer_accepted',
  counter_offer: 'counter_offer',
  agreement_pending: 'agreement_pending',
  rental_confirmed: 'accepted',
  rental_request: 'rental_request',
  rental_declined: 'rental_declined',
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
  let rentalId: string | null = null;
  const data = record.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const d = data as Record<string, unknown>;
    if (typeof d.chatId === 'string' && d.chatId.trim() !== '') chatId = d.chatId.trim();
    const rId = d.rentalId ?? d.rental_id;
    if (typeof rId === 'string' && rId.trim() !== '') rentalId = rId.trim();
  }

  const listingIdRaw = data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>).listingId ?? (data as Record<string, unknown>).listing_id
    : null;
  const listingId =
    typeof listingIdRaw === 'string' && isUuidString(listingIdRaw.trim()) ? listingIdRaw.trim() : null;

  const rrRaw =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>).rentalRequestId ?? (data as Record<string, unknown>).rental_request_id
      : null;
  const rentalRequestId =
    typeof rrRaw === 'string' && isUuidString(rrRaw.trim()) ? rrRaw.trim() : null;

  return {
    id,
    type: mapServerType(st),
    message: asMessage(tStr, bStr),
    timestamp,
    read,
    requestId: requestId as string | number | null,
    offerId,
    chatId,
    rentalId: rentalId && isUuidString(rentalId) ? rentalId : null,
    listingId,
    rentalRequestId,
    forUserId: (forUserId || '').trim() || null,
  };
}

const MAX_INITIAL_ROWS = 100;

const RECONNECT_MS = 1_000;

function runInitialServerFetch(
  supabase: ReturnType<typeof getSupabase>,
  currentUserId: string,
  cancelled: () => boolean
): void {
  void (async () => {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, user_id, type, title, body, data, read, request_id, offer_id, created_at')
      .eq('user_id', currentUserId)
      .order('created_at', { ascending: false })
      .limit(MAX_INITIAL_ROWS);

    if (cancelled()) return;
    if (error != null) {
      if (__DEV__) {
        console.warn('[notifications] initial fetch failed:', error.message);
      }
      return;
    }
    for (const row of data ?? []) {
      if (cancelled()) return;
      const n = mapSupabaseNotificationToApp(
        row as unknown as Record<string, unknown>,
        currentUserId
      );
      if (n) {
        addNotificationToStore(n);
      }
    }
  })();
}

/** Pull recent `public.notifications` rows for the signed-in user (e.g. after rental lifecycle mutations). */
export function mergeRecentNotificationsFromServer(): void {
  if (!isSupabaseConfigured()) return;
  const uid = getAuthUserIdSync()?.trim();
  if (!uid) return;
  if (__DEV__) {
    console.log('[notifications] mergeRecentNotificationsFromServer', { userId: uid });
  }
  runInitialServerFetch(getSupabase(), uid, () => false);
  void useUnifiedRentalsActivityStore.getState().refreshFromServer();
}

function removeChannel(
  supabase: ReturnType<typeof getSupabase>,
  ch: RealtimeChannel | null
): void {
  if (ch != null) {
    void supabase.removeChannel(ch);
  }
}

/**
 * One realtime session per call: single channel `notifications-${userId}` with automatic resubscribe
 * on `CHANNEL_ERROR` / `TIMED_OUT`. Unsubscribe via the returned teardown (e.g. logout or user change).
 * Root layout: run only when `session.user.id` is set; dependency array prevents duplicate clients.
 */
export function startNotificationsServerSync(userId: string): () => void {
  if (!isSupabaseConfigured() || !userId.trim()) {
    return () => undefined;
  }

  const currentUserId = userId.trim();
  const supabase = getSupabase();
  const filter = `user_id=eq.${currentUserId}`;
  let cancelled = false;
  let activeChannel: RealtimeChannel | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const clearReconnect = () => {
    if (reconnectTimer != null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const teardownChannel = () => {
    clearReconnect();
    removeChannel(supabase, activeChannel);
    activeChannel = null;
  };

  const scheduleReconnect = () => {
    clearReconnect();
    if (cancelled) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (!cancelled) {
        attach();
      }
    }, RECONNECT_MS);
  };

  /** After a successful (re)subscription, not the very first in this session, pull recent rows to fill gaps. */
  let haveSeenSubscribed = false;

  const attach = () => {
    if (cancelled) return;
    removeChannel(supabase, activeChannel);
    activeChannel = null;

    const ch = supabase
      .channel(`notifications-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter,
        },
        (payload: RealtimePostgresInsertPayload<Record<string, unknown>>) => {
          if (__DEV__) {
            console.log('REALTIME HIT', payload);
            console.log('NEW NOTIFICATION', payload.new);
          }
          const row = payload.new;
          if (row == null || typeof row !== 'object') return;
          const r = row as Record<string, unknown>;
          if (r.user_id == null) return;
          if (String(r.user_id) !== currentUserId) return;
          const rawType = typeof r.type === 'string' ? r.type : '';
          const n = mapSupabaseNotificationToApp(r, currentUserId);
          if (n) {
            addNotificationToStore(n);
            if (rawType === 'rental_confirmed') {
              void useUnifiedRentalsActivityStore.getState().refreshFromServer();
            }
            const offerIdRaw = r.offer_id;
            const offerId =
              typeof offerIdRaw === 'string' && offerIdRaw.trim() !== '' ? offerIdRaw.trim() : '';
            if (
              Platform.OS !== 'web' &&
              rawType === 'message' &&
              offerId !== '' &&
              offerId !== getActiveChatOfferThreadId()
            ) {
              const titleStr = typeof r.title === 'string' ? r.title.trim() : '';
              const bodyStr = typeof r.body === 'string' ? r.body.trim() : '';
              void presentLocalChatBanner(titleStr || 'Message', bodyStr || n.message);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter,
        },
        (payload: RealtimePostgresUpdatePayload<Record<string, unknown>>) => {
          const row = payload.new;
          if (row == null || typeof row !== 'object') return;
          const r = row as Record<string, unknown>;
          if (r.user_id == null) return;
          if (String(r.user_id) !== currentUserId) return;
          const n = mapSupabaseNotificationToApp(r, currentUserId);
          if (n) {
            replaceNotificationInStore(n);
          }
        }
      )
      .subscribe((status) => {
        if (__DEV__) {
          console.log('Realtime status:', status);
        }
        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
          if (haveSeenSubscribed) {
            // Reconnected after error/timeout: merge any rows missed while offline
            runInitialServerFetch(supabase, currentUserId, () => cancelled);
          } else {
            haveSeenSubscribed = true;
            if (__DEV__) {
              console.log('[notifications] subscribed on channel', `notifications-${currentUserId}`);
            }
          }
        }
        if (
          status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
          status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT
        ) {
          teardownChannel();
          scheduleReconnect();
        }
      });

    activeChannel = ch;
  };

  void (async () => {
    await useNotificationsStore.getState().hydrate();
    if (cancelled) return;
    runInitialServerFetch(supabase, currentUserId, () => cancelled);
    attach();
  })();

  return () => {
    cancelled = true;
    teardownChannel();
  };
}
