import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const PUSH_TOKEN_STORAGE_KEY = '@ourgarage/expo_push_token_v1';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function savePushTokenLocally(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
  } catch {
    /* ignore */
  }
}

export async function getStoredPushToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function registerForPushNotificationsAsync(): Promise<string | undefined> {
  if (Platform.OS === 'web') return undefined;
  if (!Device.isDevice) return undefined;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return undefined;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

  if (!projectId) {
    if (__DEV__) {
      console.warn(
        '[notifications] skipping Expo push token: no EAS projectId (Expo Go / dev client without extra.eas)'
      );
    }
    return undefined;
  }

  try {
    const token = (
      await Notifications.getExpoPushTokenAsync({
        projectId,
      })
    ).data;
    return token;
  } catch (e) {
    console.warn('[notifications] getExpoPushTokenAsync failed', e);
    return undefined;
  }
}

/** Registers for push (if on a physical device + permission granted) and saves the Expo token locally. */
export async function registerAndStorePushTokenAsync(): Promise<void> {
  const token = await registerForPushNotificationsAsync();
  if (token) await savePushTokenLocally(token);
}

/**
 * Fires an immediate local notification (same device) — for dev/testing only.
 * Production builds skip this (`__DEV__` is false).
 */
export async function scheduleLocalNewMessageNotificationForTesting(
  messageText: string
): Promise<void> {
  if (!__DEV__) return;
  if (Platform.OS === 'web') return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'New Message',
        body: messageText,
      },
      trigger: null,
    });
  } catch {
    /* ignore */
  }
}

/** Immediate local banner when the user receives a chat-related server notification while not on that thread. */
export async function presentLocalChatBanner(title: string, body: string): Promise<void> {
  if (Platform.OS === 'web') return;
  const t = String(title ?? '').trim();
  const b = String(body ?? '').trim();
  if (!t && !b) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: t || 'Message',
        body: b || '',
      },
      trigger: null,
    });
  } catch {
    /* ignore */
  }
}
