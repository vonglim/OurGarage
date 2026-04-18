import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMemo } from 'react';
import { create } from 'zustand';

import { getProfile } from './profileStore';

const STORAGE_KEY = '@ourgarage/notifications_v1';

export type AppNotificationType =
  | 'offer'
  | 'accepted'
  | 'started'
  | 'completed'
  | 'review'
  | 'message';

export type AppNotification = {
  id: string;
  type: AppNotificationType;
  message: string;
  timestamp: number;
  read: boolean;
  /** Request id (request `timestamp`) for navigation, when applicable */
  requestId: number | null;
  /** Chat route id (`req-…`) for message notifications */
  chatId: string | null;
  /**
   * If set, this notification is only shown to this user (e.g. incoming chat for recipient).
   * Omit for broadcast/system rows (offers, etc.).
   */
  forUserId: string | null;
};

function normalizeLoaded(raw: unknown): AppNotification[] {
  if (!Array.isArray(raw)) return [];
  const types: AppNotificationType[] = [
    'offer',
    'accepted',
    'started',
    'completed',
    'review',
    'message',
  ];
  const out: AppNotification[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id : '';
    if (!types.includes(r.type as AppNotificationType)) continue;
    const type = r.type as AppNotificationType;
    const message = typeof r.message === 'string' ? r.message : '';
    const timestamp = typeof r.timestamp === 'number' ? r.timestamp : 0;
    const read = r.read === true;
    const requestId =
      typeof r.requestId === 'number' && Number.isFinite(r.requestId) ? r.requestId : null;
    const chatId = typeof r.chatId === 'string' && r.chatId.length > 0 ? r.chatId : null;
    const forUserId =
      typeof r.forUserId === 'string' && r.forUserId.length > 0 ? r.forUserId : null;
    if (!id || !timestamp) continue;
    out.push({ id, type, message, timestamp, read, requestId, chatId, forUserId });
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
  const me = getProfile().userId;
  if (n.forUserId == null || n.forUserId === '') return true;
  return n.forUserId === me;
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Lazy deps avoid static import cycle (requests/chat → notifications). */
function filterStaleNotifications(list: AppNotification[]): AppNotification[] {
  const { getRequestByTimestamp } = require('./requestsStore') as typeof import('./requestsStore');
  const { getChatById } = require('./chatStore') as typeof import('./chatStore');

  return list.filter((n) => {
    if (n.type === 'offer') {
      if (n.requestId == null || !Number.isFinite(n.requestId)) return false;
      return getRequestByTimestamp(n.requestId) != null;
    }
    if (n.type === 'message') {
      if (typeof n.chatId === 'string' && n.chatId.length > 0) {
        return getChatById(n.chatId) != null;
      }
      if (n.requestId != null && Number.isFinite(n.requestId)) {
        return getChatById(`req-${n.requestId}`) != null;
      }
      return false;
    }
    return true;
  });
}

type AddNotificationInput = {
  type: AppNotificationType;
  message: string;
  requestId?: number | null;
  chatId?: string | null;
  forUserId?: string | null;
};

type NotificationsState = {
  notifications: AppNotification[];
  /** Load persisted rows (merge in-memory extras) and drop stale offer/message rows. */
  hydrate: () => Promise<void>;
  /** Re-run validation on current list (e.g. after request/chat removed). Persists if anything removed. */
  cleanupStaleNotifications: () => void;
  addNotification: (entry: AddNotificationInput) => void;
  markAsRead: (notificationId: string) => void;
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
  addNotification: (entry) => {
    const row: AppNotification = {
      id: newId(),
      type: entry.type,
      message: entry.message,
      timestamp: Date.now(),
      read: false,
      requestId: entry.requestId ?? null,
      chatId: entry.chatId ?? null,
      forUserId: entry.forUserId ?? null,
    };
    set((state) => ({
      notifications: [row, ...state.notifications],
    }));
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
}));

/** Imperative API for non-React modules (same as store action). */
export function addNotification(entry: AddNotificationInput): void {
  useNotificationsStore.getState().addNotification(entry);
}

export function markAsRead(notificationId: string): void {
  useNotificationsStore.getState().markAsRead(notificationId);
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
  const me = getProfile().userId;
  return useNotificationsStore.getState().notifications.filter(
    (n) => !n.read && (n.forUserId == null || n.forUserId === '' || n.forUserId === me)
  ).length;
}

/** Subscribe to the raw list; derive visible rows with `useMemo` in UI to avoid unstable array refs. */
export function useNotificationsList(): AppNotification[] {
  const notifications = useNotificationsStore((s) => s.notifications);
  return useMemo(
    () =>
      [...notifications]
        .filter(isVisibleToCurrentUser)
        .sort((a, b) => b.timestamp - a.timestamp),
    [notifications]
  );
}

export function useUnreadNotificationCount(): number {
  const notifications = useNotificationsStore((s) => s.notifications);
  return useMemo(() => {
    const me = getProfile().userId;
    return notifications.filter(
      (n) => !n.read && (n.forUserId == null || n.forUserId === '' || n.forUserId === me)
    ).length;
  }, [notifications]);
}
