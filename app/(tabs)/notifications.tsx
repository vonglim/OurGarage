import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from '../components/KeyboardDismissScreen';
import type { AppNotification } from '../store/notificationsStore';
import { openChatForRequest } from '../lib/openRequestChat';
import {
  markAsRead,
  useNotificationsList,
  useNotificationsStore,
} from '../store/notificationsStore';
import { cardChrome, ui } from '@/constants/appUi';

function typeLabel(t: AppNotification['type']): string {
  switch (t) {
    case 'offer':
      return 'Offer';
    case 'accepted':
      return 'Match';
    case 'started':
      return 'Rental';
    case 'completed':
      return 'Completed';
    case 'review':
      return 'Review';
    case 'message':
      return 'Message';
    default:
      return '';
  }
}

function formatWhen(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function NotificationMessage({ text }: { text: string }) {
  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
  if (lines.length >= 2) {
    return (
      <View style={styles.messageBlock}>
        <Text style={styles.messagePrimary}>{lines[0]}</Text>
        {lines.slice(1).map((line, i) => (
          <Text key={i} style={styles.messageSecondary}>
            {line}
          </Text>
        ))}
      </View>
    );
  }
  return <Text style={styles.message}>{text}</Text>;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const list = useNotificationsList();

  useFocusEffect(
    useCallback(() => {
      useNotificationsStore.getState().cleanupStaleNotifications();
    }, []),
  );

  const navigateFromNotification = (n: AppNotification) => {
    if (n.type === 'review') {
      router.push('/reviews');
      return;
    }
    if (n.type === 'message') {
      if (n.chatId) {
        router.push({ pathname: '/chat/[id]', params: { id: n.chatId } });
        return;
      }
      if (n.requestId != null) {
        openChatForRequest(router, n.requestId);
        return;
      }
    }
    if (n.requestId != null) {
      router.push({
        pathname: '/request-details',
        params: { requestId: String(n.requestId) },
      });
    }
  };

  return (
    <KeyboardDismissScreen style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>Notifications</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 28 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {list.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No notifications yet.</Text>
          </View>
        ) : (
          <View style={styles.listCard}>
            {list.map((n, index) => {
              const isLast = index === list.length - 1;
              return (
                <Pressable
                  key={n.id}
                  onPress={() => {
                    markAsRead(n.id);
                    navigateFromNotification(n);
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    !n.read && styles.rowUnread,
                    !isLast && styles.rowBorder,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <View style={styles.rowTop}>
                    {!n.read ? <View style={styles.unreadDot} /> : <View style={styles.readSpacer} />}
                    <Text style={styles.typePill}>{typeLabel(n.type)}</Text>
                    <Text style={styles.time}>{formatWhen(n.timestamp)}</Text>
                  </View>
                  <NotificationMessage text={n.message} />
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </KeyboardDismissScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    letterSpacing: -0.3,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  emptyCard: {
    ...cardChrome,
    padding: ui.padCard + 6,
  },
  emptyText: {
    fontSize: 15,
    color: ui.textSubtle,
    textAlign: 'center',
  },
  listCard: {
    ...cardChrome,
    overflow: 'hidden',
  },
  row: {
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  rowUnread: {
    backgroundColor: '#F3F8FF',
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  rowPressed: {
    opacity: 0.9,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ui.primary,
  },
  readSpacer: {
    width: 8,
    height: 8,
  },
  typePill: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6D6D72',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    backgroundColor: '#ECECEC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  time: {
    flex: 1,
    textAlign: 'right',
    fontSize: 12,
    color: '#8E8E93',
  },
  message: {
    fontSize: 16,
    lineHeight: 22,
    color: '#1C1C1E',
    paddingLeft: 16,
  },
  messageBlock: {
    paddingLeft: 16,
    gap: 4,
  },
  messagePrimary: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: '#000',
    letterSpacing: -0.2,
  },
  messageSecondary: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '400',
    color: ui.textSubtle,
  },
});
