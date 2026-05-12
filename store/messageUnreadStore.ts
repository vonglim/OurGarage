import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { fetchUnreadMessageCountsByOffer } from '@/lib/messageUnread';

const STORAGE_KEY = '@ourgarage/message_unread_v1';

type MessageUnreadState = {
  unreadByOfferId: Record<string, number>;
  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
  clear: () => void;
  bumpUnreadForOfferId: (offerId: string) => void;
};

async function persistUnread(next: Record<string, number>): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

async function loadUnread(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed ?? {})) {
      if (!k) continue;
      const n = typeof v === 'number' ? v : Number(v);
      if (Number.isFinite(n) && n > 0) out[k] = Math.floor(n);
    }
    return out;
  } catch {
    return {};
  }
}

export const useMessageUnreadStore = create<MessageUnreadState>((set) => ({
  unreadByOfferId: {},
  hydrate: async () => {
    if (__DEV__) console.log('[messageUnreadStore] hydrate start');
    const local = await loadUnread();
    if (__DEV__) console.log('[messageUnreadStore] hydrate local', local);
    const next = await fetchUnreadMessageCountsByOffer();
    if (Object.keys(next).length > 0 || Object.keys(local).length === 0) {
      if (__DEV__) console.log('[messageUnreadStore] setUnreadTotals (hydrate:backend)', next);
      set({ unreadByOfferId: next });
      void persistUnread(next);
      return;
    }
    if (__DEV__) {
      console.log('[messageUnreadStore] setUnreadTotals (hydrate:local-fallback)', local);
    }
    set({ unreadByOfferId: local });
  },
  refresh: async () => {
    if (__DEV__) console.log('[messageUnreadStore] refresh start');
    const next = await fetchUnreadMessageCountsByOffer();
    if (__DEV__) console.log('[messageUnreadStore] setUnreadTotals (refresh)', next);
    set({ unreadByOfferId: next });
    void persistUnread(next);
  },
  clear: () => {
    if (__DEV__) console.log('[UNREAD CLEAR] reason=auth_reset scope=unread_store screen=root_layout');
    set({ unreadByOfferId: {} });
    void AsyncStorage.removeItem(STORAGE_KEY);
  },
  bumpUnreadForOfferId: (offerId) => {
    const id = offerId.trim();
    if (!id) return;
    set((s) => {
      const prev = s.unreadByOfferId[id] ?? 0;
      const next = { ...s.unreadByOfferId, [id]: prev + 1 };
      void persistUnread(next);
      return { unreadByOfferId: next };
    });
  },
}));

export function bumpUnreadForOfferId(offerId: string): void {
  useMessageUnreadStore.getState().bumpUnreadForOfferId(offerId);
}

export function useUnreadMessagesTotal(): number {
  const byOffer = useMessageUnreadStore((s) => s.unreadByOfferId);
  return Object.values(byOffer).reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0);
}

export function useUnreadMessagesForOffer(offerId: string | null | undefined): number {
  const byOffer = useMessageUnreadStore((s) => s.unreadByOfferId);
  const id = (offerId ?? '').trim();
  if (!id) return 0;
  const n = byOffer[id];
  return typeof n === 'number' && n > 0 ? n : 0;
}
