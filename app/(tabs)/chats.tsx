import { useRouter } from 'expo-router';
import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from '../components/KeyboardDismissScreen';
import {
  getLastMessagePreview,
  getOtherParticipant,
  getUnreadCountForUser,
  useChats,
  type Chat,
} from '../store/chatStore';
import { getProfile } from '../store/profileStore';
import { ui } from '@/constants/appUi';

function sortByLatest(a: Chat, b: Chat): number {
  const ta = a.messages.length ? a.messages[a.messages.length - 1].timestamp : a.createdAt;
  const tb = b.messages.length ? b.messages[b.messages.length - 1].timestamp : b.createdAt;
  return tb - ta;
}

export default function ChatsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const chats = useChats();
  const me = getProfile();
  const active = chats.filter((c) => !c.archived).sort(sortByLatest);
  const archived = chats.filter((c) => c.archived).sort(sortByLatest);
  const hasAny = active.length > 0 || archived.length > 0;

  return (
    <KeyboardDismissScreen style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>Messages</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 28 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {!hasAny ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptyBody}>
              When you accept an offer on a request, a chat opens so you can coordinate pickup or
              delivery.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Active</Text>
            {active.length === 0 ? (
              <Text style={styles.sectionEmpty}>No active conversations</Text>
            ) : (
              <View style={styles.listCard}>
                {active.map((chat, index) => {
                  const other = getOtherParticipant(chat, me.userId);
                  const preview = getLastMessagePreview(chat);
                  const unread = getUnreadCountForUser(chat, me.userId);
                  const isLast = index === active.length - 1;
                  return (
                    <Pressable
                      key={chat.id}
                      onPress={() =>
                        router.push({ pathname: '/chat/[id]', params: { id: chat.id } })
                      }
                      style={({ pressed }) => [
                        styles.row,
                        !isLast && styles.rowBorder,
                        pressed && styles.rowPressed,
                      ]}
                    >
                      <View style={styles.rowText}>
                        <View style={styles.nameRow}>
                          <Text style={styles.rowName} numberOfLines={1}>
                            {other.displayName}
                          </Text>
                          {unread > 0 ? (
                            <View style={styles.unreadBadge}>
                              <Text style={styles.unreadBadgeText}>
                                {unread > 99 ? '99+' : String(unread)}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.rowPreview} numberOfLines={2}>
                          {preview}
                        </Text>
                      </View>
                      <Text style={styles.chevron}>›</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <Text style={[styles.sectionTitle, styles.sectionTitleArchived]}>Archived</Text>
            {archived.length === 0 ? (
              <Text style={styles.sectionEmptyMuted}>No archived chats</Text>
            ) : (
              <View style={[styles.listCard, styles.listCardArchived]}>
                {archived.map((chat, index) => {
                  const other = getOtherParticipant(chat, me.userId);
                  const preview = getLastMessagePreview(chat);
                  const unread = getUnreadCountForUser(chat, me.userId);
                  const isLast = index === archived.length - 1;
                  return (
                    <Pressable
                      key={chat.id}
                      onPress={() =>
                        router.push({ pathname: '/chat/[id]', params: { id: chat.id } })
                      }
                      style={({ pressed }) => [
                        styles.rowArchived,
                        !isLast && styles.rowBorderArchived,
                        pressed && styles.rowPressedArchived,
                      ]}
                    >
                      <View style={styles.rowText}>
                        <View style={styles.nameRow}>
                          <Text style={styles.rowNameArchived} numberOfLines={1}>
                            {other.displayName}
                          </Text>
                          {unread > 0 ? (
                            <View style={[styles.unreadBadge, styles.unreadBadgeArchived]}>
                              <Text style={styles.unreadBadgeText}>
                                {unread > 99 ? '99+' : String(unread)}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.rowPreviewArchived} numberOfLines={2}>
                          {preview}
                        </Text>
                      </View>
                      <Text style={styles.chevronArchived}>›</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
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
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6D6D72',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  sectionTitleArchived: {
    marginTop: 22,
  },
  sectionEmpty: {
    fontSize: 14,
    color: ui.textSubtle,
    marginBottom: 4,
  },
  sectionEmptyMuted: {
    fontSize: 13,
    color: '#AEAEB2',
    marginBottom: 4,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 15,
    color: ui.textSubtle,
    lineHeight: 22,
  },
  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
    marginBottom: 4,
  },
  listCardArchived: {
    backgroundColor: '#F9F9FB',
    borderColor: '#E8E8ED',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  rowPressed: {
    backgroundColor: '#F9F9F9',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    minWidth: 0,
  },
  rowName: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    minWidth: 0,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: ui.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeArchived: {
    backgroundColor: '#AEAEB2',
  },
  unreadBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  rowPreview: {
    fontSize: 14,
    color: ui.textSubtle,
    lineHeight: 20,
  },
  chevron: {
    fontSize: 22,
    color: '#C7C7CC',
    marginLeft: 8,
  },
  rowArchived: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#F9F9FB',
  },
  rowBorderArchived: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8E8ED',
  },
  rowPressedArchived: {
    backgroundColor: '#F0F0F4',
  },
  rowNameArchived: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#636366',
    minWidth: 0,
  },
  rowPreviewArchived: {
    fontSize: 12,
    color: '#8E8E93',
    lineHeight: 17,
  },
  chevronArchived: {
    fontSize: 18,
    color: '#AEAEB2',
    marginLeft: 8,
  },
});
