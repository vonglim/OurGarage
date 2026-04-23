import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Pressable } from '@/components/Pressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from '@/components/KeyboardDismissScreen';
import {
  getLastMessagePreview,
  getOtherParticipant,
  getUnreadCountForUser,
  useChats,
  type Chat,
} from '@/store/chatStore';
import { useAuthUserId } from '@/lib/authUser';
import { prefetchProfileNamesForUserIds } from '@/lib/profileDisplayName';
import { ui } from '@/constants/appUi';
import { useProfileCacheVersion } from '@/hooks/useProfileCacheVersion';

function sortByLatest(a: Chat, b: Chat): number {
  const ta = a.messages.length ? a.messages[a.messages.length - 1].timestamp : a.createdAt;
  const tb = b.messages.length ? b.messages[b.messages.length - 1].timestamp : b.createdAt;
  return tb - ta;
}

export default function ChatsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const chats = useChats();
  const me = useAuthUserId();
  useProfileCacheVersion();

  useEffect(() => {
    const ids: string[] = [];
    for (const c of chats) {
      for (const p of c.participants) {
        if (p.userId) ids.push(p.userId);
      }
      for (const m of c.messages) {
        if (m.senderId) ids.push(m.senderId);
        if (m.receiverId) ids.push(m.receiverId);
      }
    }
    void prefetchProfileNamesForUserIds(ids);
  }, [chats]);
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
                  const other = getOtherParticipant(chat, me);
                  const preview = getLastMessagePreview(chat);
                  const unread = getUnreadCountForUser(chat, me);
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
                  const other = getOtherParticipant(chat, me);
                  const preview = getLastMessagePreview(chat);
                  const unread = getUnreadCountForUser(chat, me);
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
    backgroundColor: ui.surfaceGrouped,
  },
  header: {
    paddingHorizontal: ui.padScreenH,
    paddingBottom: ui.spaceSm + 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: ui.textPrimary,
    letterSpacing: -0.3,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: ui.padScreenH,
    paddingTop: ui.spaceMd,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: ui.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: ui.spaceSm,
  },
  sectionTitleArchived: {
    marginTop: ui.spaceSection - 6,
  },
  sectionEmpty: {
    fontSize: 14,
    color: ui.textSubtle,
    marginBottom: 4,
  },
  sectionEmptyMuted: {
    fontSize: 13,
    color: ui.textSecondary,
    marginBottom: 4,
  },
  emptyCard: {
    backgroundColor: ui.background,
    borderRadius: ui.radiusCard,
    padding: ui.padScreenH,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 15,
    color: ui.textSubtle,
    lineHeight: 22,
  },
  listCard: {
    backgroundColor: ui.background,
    borderRadius: ui.radiusButton,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    marginBottom: 4,
  },
  listCardArchived: {
    backgroundColor: ui.surfaceInput,
    borderColor: ui.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: ui.background,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
  },
  rowPressed: {
    backgroundColor: ui.surfaceInput,
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
    fontWeight: '700',
    color: ui.textPrimary,
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
    backgroundColor: ui.textSecondary,
  },
  unreadBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: ui.primaryOn,
  },
  rowPreview: {
    fontSize: 14,
    color: ui.textSubtle,
    lineHeight: 20,
  },
  chevron: {
    fontSize: 22,
    color: ui.textSecondary,
    marginLeft: 8,
  },
  rowArchived: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: ui.surfaceInput,
  },
  rowBorderArchived: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
  },
  rowPressedArchived: {
    backgroundColor: ui.borderLight,
  },
  rowNameArchived: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: ui.textSecondary,
    minWidth: 0,
  },
  rowPreviewArchived: {
    fontSize: 12,
    color: ui.textSecondary,
    lineHeight: 17,
  },
  chevronArchived: {
    fontSize: 18,
    color: ui.textSecondary,
    marginLeft: 8,
  },
});
