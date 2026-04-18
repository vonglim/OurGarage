import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMemo, useSyncExternalStore } from 'react';

const STORAGE_KEY = '@ourgarage/notifications_v1';

export type AppNotificationType = 'offer' | 'accepted' | 'started' | 'completed' | 'review';

export type AppNotification = {
  id: string;
  type: AppNotificationType;
  message: string;
  timestamp: number;
  read: boolean;
  /** Request id (request `timestamp`) for navigation, when applicable */
  requestId: number | null;
};

let notifications: AppNotification[] = [];
let version = 0;
const listeners = new Set<() => void>();
let loadStarted = false;

function emit() {
  version += 1;
  listeners.forEach((l) => l());
}

async function persist() {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
  } catch {
    /* ignore */
  }
}

function normalizeLoaded(raw: unknown): AppNotification[] {
  if (!Array.isArray(raw)) return [];
  const types: AppNotificationType[] = ['offer', 'accepted', 'started', 'completed', 'review'];
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
    if (!id || !timestamp) continue;
    out.push({ id, type, message, timestamp, read, requestId });
  }
  return out;
}

async function loadFromStorage() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      notifications = normalizeLoaded(JSON.parse(raw));
    }
  } catch {
    /* ignore */
  }
  emit();
}

function ensureLoad() {
  if (!loadStarted) {
    loadStarted = true;
    void loadFromStorage();
  }
}

export function subscribeNotifications(listener: () => void) {
  ensureLoad();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getVersion(): number {
  ensureLoad();
  return version;
}

export function getNotifications(): AppNotification[] {
  ensureLoad();
  return [...notifications].sort((a, b) => b.timestamp - a.timestamp);
}

export function getUnreadNotificationCount(): number {
  ensureLoad();
  return notifications.filter((n) => !n.read).length;
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function addNotification(entry: {
  type: AppNotificationType;
  message: string;
  requestId?: number | null;
}): void {
  ensureLoad();
  notifications = [
    {
      id: newId(),
      type: entry.type,
      message: entry.message,
      timestamp: Date.now(),
      read: false,
      requestId: entry.requestId ?? null,
    },
    ...notifications,
  ];
  emit();
  void persist();
}

export function markNotificationRead(id: string): void {
  ensureLoad();
  notifications = notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
  emit();
  void persist();
}

export function useNotificationsList(): AppNotification[] {
  const v = useSyncExternalStore(subscribeNotifications, getVersion, getVersion);
  return useMemo(() => {
    void v;
    return getNotifications();
  }, [v]);
}

export function useUnreadNotificationCount(): number {
  const v = useSyncExternalStore(subscribeNotifications, getVersion, getVersion);
  return useMemo(() => {
    void v;
    return getUnreadNotificationCount();
  }, [v]);
}
