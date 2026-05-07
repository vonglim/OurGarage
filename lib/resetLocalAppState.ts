import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearAllChats } from '@/store/chatStore';
import { clearAllNotifications } from '@/store/notificationsStore';
import { useMessageUnreadStore } from '@/store/messageUnreadStore';

const LOCAL_KEYS = ['@ourgarage/chats_v1', '@ourgarage/notifications_v1', '@ourgarage/message_unread_v1'];

async function removePersistedMessagingKeys(): Promise<void> {
  try {
    await AsyncStorage.multiRemove(LOCAL_KEYS);
  } catch (e) {
    if (__DEV__) {
      console.warn('[local-state-reset] failed removing AsyncStorage keys', e);
    }
  }
}

/** Clears in-memory + persisted local messaging state. */
export async function resetLocalMessagingState(reason: string): Promise<void> {
  if (__DEV__) {
    console.log('[local-state-reset] resetLocalMessagingState', { reason });
  }
  clearAllChats();
  clearAllNotifications();
  useMessageUnreadStore.getState().clear();
  await removePersistedMessagingKeys();
}

declare global {
  // eslint-disable-next-line no-var
  var __RESET_LOCAL_APP_STATE__: undefined | (() => Promise<void>);
}

/** Dev helper to wipe all persisted local chat/message state at runtime. */
export function installDevLocalStateResetHelper(): void {
  if (!__DEV__) return;
  globalThis.__RESET_LOCAL_APP_STATE__ = async () => {
    await resetLocalMessagingState('manual_dev_global');
  };
  if (__DEV__) {
    console.log('[local-state-reset] installed globalThis.__RESET_LOCAL_APP_STATE__()');
  }
}
