import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMemo } from 'react';
import { create } from 'zustand';

import { getAuthUserIdSync, useAuthUserId } from '@/lib/authUser';
import { nextLocalId } from '@/lib/idFactory';
import { shouldBlockSelfNotificationToUserId } from '@/lib/notificationRecipientGuard';
import { isUuidString } from '@/lib/requestOwnership';

const STORAGE_KEY = '@ourgarage/notifications_v1';

export type AppNotificationType =
  | 'new_offer'
  | 'counter_offer'
  | 'agreement_pending'
  | 'offer_accepted'
  | 'accepted'
  | 'declined'
  | 'started'
  | 'completed'
  | 'review'
  | 'message'
  /** Listing `rental_requests` — owner inbox / Activity badge. */
  | 'rental_request'
  /** Renter notified when a listing rental request is declined. */
  | 'rental_declined';

export type AppNotification = {
  id: string;
  type: AppNotificationType;
  message: string;
  timestamp: number;
  read: boolean;
  /** Supabase `requests.id` (UUID) when known; legacy persisted rows may still use request `timestamp` (number). */
  requestId: string | number | null;
  /** Offer row id (typically offer `timestamp` as string). */
  offerId: string | null;
  /** Chat route id (`req-…`) for message notifications */
  chatId: string | null;
  /** `rentals.id` when the workflow lives in the rental workspace (post-accept / meetup / lifecycle). */
  rentalId: string | null;
  /** `listings.id` from server `notifications.data` (listing rental flow). */
  listingId?: string | null;
  /** `rental_requests.id` from server `notifications.data`. */
  rentalRequestId?: string | null;
  /**
   * If set, this notification is only shown to this user (e.g. incoming chat for recipient).
   * Omit for broadcast/system rows (offers, etc.).
   */
  forUserId: string | null;
};

function normalizeLoaded(raw: unknown): AppNotification[] {
  if (!Array.isArray(raw)) return [];
  const legacyTypes = new Set([
    'offer',
    'accepted',
    'started',
    'completed',
    'review',
    'message',
    'new_offer',
    'offer_created',
    'offer_updated',
    'counter_offer',
    'agreement_pending',
    'offer_accepted',
    'declined',
    'rental_request',
    'rental_declined',
    'rental_confirmed',
  ]);
  const toAppType = (t: string): string => {
    if (t === 'offer_created' || t === 'offer_updated') return 'new_offer';
    if (t === 'offer' || t === 'new_offer') return 'new_offer';
    if (t === 'rental_confirmed') return 'accepted';
    return t;
  };
  const out: AppNotification[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id : '';
    const rawType = typeof r.type === 'string' ? r.type : '';
    if (!legacyTypes.has(rawType)) continue;
    const type = toAppType(
      rawType === 'offer' ? 'new_offer' : rawType
    ) as AppNotificationType;
    const message = typeof r.message === 'string' ? r.message : '';
    const timestamp = typeof r.timestamp === 'number' ? r.timestamp : 0;
    const read = r.read === true;
    const rawRid = r.requestId;
    let requestId: string | number | null = null;
    if (typeof rawRid === 'number' && Number.isFinite(rawRid)) requestId = rawRid;
    else if (typeof rawRid === 'string' && rawRid.trim() !== '') requestId = rawRid.trim();
    const offerId =
      typeof r.offerId === 'string' && r.offerId.length > 0 ? r.offerId : null;
    const chatId = typeof r.chatId === 'string' && r.chatId.length > 0 ? r.chatId : null;
    const rawRent = r.rentalId;
    const rentalId =
      typeof rawRent === 'string' && isUuidString(rawRent.trim()) ? rawRent.trim() : null;
    const forUserId =
      typeof r.forUserId === 'string' && r.forUserId.length > 0 ? r.forUserId : null;
    const lid = r.listingId;
    const listingId =
      typeof lid === 'string' && isUuidString(lid.trim()) ? lid.trim() : null;
    const rq = r.rentalRequestId;
    const rentalRequestId =
      typeof rq === 'string' && isUuidString(rq.trim()) ? rq.trim() : null;
    if (!id || !timestamp) continue;
    out.push({
      id,
      type,
      message,
      timestamp,
      read,
      requestId,
      offerId,
      chatId,
      rentalId,
      listingId,
      rentalRequestId,
      forUserId,
    });
  }
  return out;
}

async function readStorage(): Promise<AppNotification[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return normalizeLoaded(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function persistNotifications(notifications: AppNotification[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
  } catch {
    /* ignore */
  }
}

function isVisibleToCurrentUser(n: AppNotification): boolean {
  const me = getAuthUserIdSync();
  if (n.forUserId == null || n.forUserId === '') return true;
  return n.forUserId === me;
}

function newId(): string {
  return nextLocalId('notif');
}

/** Lazy deps avoid static import cycle (requests/chat → notifications). */
function filterStaleNotifications(list: AppNotification[]): AppNotification[] {
  const { resolveRequestFromRouteId } =
    require('./requestsStore') as typeof import('./requestsStore');
  const { getChatById } = require('./chatStore') as typeof import('./chatStore');

  return list.filter((n) => {
    if (
      n.type === 'new_offer' ||
      n.type === 'counter_offer' ||
      n.type === 'agreement_pending' ||
      n.type === 'offer_accepted' ||
      n.type === 'declined'
    ) {
      if (typeof n.rentalId === 'string' && isUuidString(n.rentalId)) return true;
      if (n.requestId == null) return false;
      return resolveRequestFromRouteId(n.requestId) != null;
    }
    if (n.type === 'message') {
      if (typeof n.rentalId === 'string' && isUuidString(n.rentalId)) return true;
      if (n.requestId != null && resolveRequestFromRouteId(n.requestId) != null) {
        return true;
      }
      if (typeof n.chatId === 'string' && n.chatId.length > 0) {
        return getChatById(n.chatId) != null;
      }
      return false;
    }
    if (n.type === 'rental_request' || n.type === 'rental_declined') return true;
    return true;
  });
}

type AddNotificationInput = {
  type: AppNotificationType;
  message: string;
  requestId?: string | number | null;
  offerId?: string | null;
  chatId?: string | null;
  rentalId?: string | null;
  forUserId?: string | null;
};

type NotificationsState = {
  notifications: AppNotification[];
  /** Load persisted rows (merge in-memory extras) and drop stale offer/message rows. */
  hydrate: () => Promise<void>;
  /** Re-run validation on current list (e.g. after request/chat removed). Persists if anything removed. */
  cleanupStaleNotifications: () => void;
  /** Clear in-memory + persisted notifications (dev / testing clean slate). */
  clearAllNotifications: () => void;
  addNotification: (entry: AddNotificationInput) => void;
  /**
   * Merges a full row (e.g. from Supabase), sorted newest-first, without replacing the list
   * or duplicating the same `id`.
   */
  addNotificationToStore: (row: AppNotification) => void;
  /**
   * Replaces an existing row by `id` (e.g. realtime `UPDATE` when `read` flips to true on the server).
   * If missing, prepends the row (same as add).
   */
  replaceNotificationInStore: (row: AppNotification) => void;
  markAsRead: (notificationId: string) => void;
  /** All rows for the current user; use when viewing Activity / Notifications or dismissing the badge. */
  markAllAsRead: () => void;
  /** Mark all unread except message rows (used by Activity so chat unread remains sticky). */
  markAllAsReadExceptMessages: () => void;
  removeNotification: (notificationId: string) => void;
};

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  notifications: [],
  hydrate: async () => {
    const loaded = await readStorage();
    let mergedCount = 0;
    let validCount = 0;
    set((state) => {
      const loadedIds = new Set(loaded.map((n) => n.id));
      const extras = state.notifications.filter((n) => !loadedIds.has(n.id));
      const merged = [...extras, ...loaded].sort((a, b) => b.timestamp - a.timestamp);
      mergedCount = merged.length;
      const validNotifications = filterStaleNotifications(merged);
      validCount = validNotifications.length;
      return { notifications: validNotifications };
    });
    if (validCount !== mergedCount) void persistNotifications(get().notifications);
  },
  cleanupStaleNotifications: () => {
    const before = get().notifications;
    const validNotifications = filterStaleNotifications(before);
    if (validNotifications.length === before.length) return;
    set({ notifications: validNotifications });
    void persistNotifications(validNotifications);
  },
  clearAllNotifications: () => {
    set({ notifications: [] });
    void persistNotifications([]);
  },
  addNotification: (entry) => {
    const target = entry.forUserId;
    if (target != null && target !== '' && shouldBlockSelfNotificationToUserId(target)) {
      return;
    }
    const row: AppNotification = {
      id: newId(),
      type: entry.type,
      message: entry.message,
      timestamp: Date.now(),
      read: false,
      requestId: entry.requestId ?? null,
      offerId: entry.offerId ?? null,
      chatId: entry.chatId ?? null,
      rentalId:
        entry.rentalId != null && isUuidString(String(entry.rentalId).trim())
          ? String(entry.rentalId).trim()
          : null,
      listingId: null,
      rentalRequestId: null,
      forUserId: target ?? null,
    };
    set((state) => ({
      notifications: [row, ...state.notifications],
    }));
    void persistNotifications(get().notifications);
  },
  addNotificationToStore: (row) => {
    // Server / realtime rows always have forUserId === the recipient. Do NOT use
    // shouldBlockSelfNotification (that guard is only for locally created rows in addNotification).
    set((state) => {
      if (state.notifications.some((n) => n.id === row.id)) {
        return state;
      }
      return {
        notifications: [row, ...state.notifications].sort(
          (a, b) => b.timestamp - a.timestamp
        ),
      };
    });
    if (__DEV__) {
      console.log('NOTIFICATION RECEIVED:', row);
    }
    void persistNotifications(get().notifications);
  },
  replaceNotificationInStore: (row) => {
    set((state) => {
      const has = state.notifications.some((n) => n.id === row.id);
      if (!has) {
        return {
          notifications: [row, ...state.notifications].sort(
            (a, b) => b.timestamp - a.timestamp
          ),
        };
      }
      return {
        notifications: state.notifications
          .map((n) => (n.id === row.id ? row : n))
          .sort((a, b) => b.timestamp - a.timestamp),
      };
    });
    void persistNotifications(get().notifications);
  },
  markAsRead: (notificationId) => {
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === notificationId ? { ...n, read: true } : n
      ),
    }));
    void persistNotifications(get().notifications);
  },
  markAllAsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
    }));
    void persistNotifications(get().notifications);
  },
  markAllAsReadExceptMessages: () => {
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.type === 'message' ? n : { ...n, read: true }
      ),
    }));
    void persistNotifications(get().notifications);
  },
  removeNotification: (notificationId) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== notificationId),
    }));
    void persistNotifications(get().notifications);
  },
}));

/** Imperative API for non-React modules (same as store action). */
export function addNotification(entry: AddNotificationInput): void {
  useNotificationsStore.getState().addNotification(entry);
}

export function addNotificationToStore(row: AppNotification): void {
  useNotificationsStore.getState().addNotificationToStore(row);
}

export function replaceNotificationInStore(row: AppNotification): void {
  useNotificationsStore.getState().replaceNotificationInStore(row);
}

export function clearAllNotifications(): void {
  useNotificationsStore.getState().clearAllNotifications();
}

export function markAsRead(notificationId: string): void {
  useNotificationsStore.getState().markAsRead(notificationId);
}

export function removeNotification(notificationId: string): void {
  useNotificationsStore.getState().removeNotification(notificationId);
}

/** @deprecated Use `markAsRead` */
export function markNotificationRead(id: string): void {
  markAsRead(id);
}

export function getNotifications(): AppNotification[] {
  return [...useNotificationsStore.getState().notifications]
    .filter(isVisibleToCurrentUser)
    .sort((a, b) => b.timestamp - a.timestamp);
}

export function getUnreadNotificationCount(): number {
  const me = getAuthUserIdSync();
  return useNotificationsStore.getState().notifications.filter(
    (n) => !n.read && (n.forUserId == null || n.forUserId === '' || n.forUserId === me)
  ).length;
}

/** Subscribe to the raw list; derive visible rows with `useMemo` in UI to avoid unstable array refs. */
export function useNotificationsList(): AppNotification[] {
  const notifications = useNotificationsStore((s) => s.notifications);
  const me = useAuthUserId();
  return useMemo(
    () =>
      [...notifications]
        .filter(isVisibleToCurrentUser)
        .sort((a, b) => b.timestamp - a.timestamp),
    [notifications, me]
  );
}

export function useUnreadNotificationCount(): number {
  const notifications = useNotificationsStore((s) => s.notifications);
  const me = useAuthUserId();
  return useMemo(() => {
    return notifications.filter(
      (n) => !n.read && (n.forUserId == null || n.forUserId === '' || n.forUserId === me)
    ).length;
  }, [notifications, me]);
}
