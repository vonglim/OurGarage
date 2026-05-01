import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Pressable } from '@/components/Pressable';
import { ScreenBackButton } from '@/components/ScreenBackButton';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from '@/components/KeyboardDismissScreen';
import { getProfileNameForUserId, prefetchProfileNamesForUserIds } from '@/lib/profileDisplayName';
import { getPublicProfileForView } from '@/lib/publicProfiles';
import {
  addChatMessage,
  getOtherParticipant,
  isUserChatMessage,
  markChatRead,
  syncChatWithSupabase,
  useChatStore,
  type ChatMessage,
} from '@/store/chatStore';
import { useAuthUserId } from '@/lib/authUser';
import { showFeedbackToast } from '@/store/feedbackToastStore';
import { getRequestByTimestamp } from '@/store/requestsStore';
import { subtleControlPressed, ui } from '@/constants/appUi';
import { useProfileCacheVersion } from '@/hooks/useProfileCacheVersion';

/** Metro sets `__DEV__` — true in development, stripped/false in production release builds. */
declare const __DEV__: boolean;

export default function ChatDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const chatId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '';
  const chats = useChatStore((state) => state.chats);
  const chat = chats.find((c) => c.id === chatId);
  const meId = useAuthUserId();
  const other = chat ? getOtherParticipant(chat, meId) : null;
  useProfileCacheVersion();
  const isArchived = chat ? chat.archived === true : false;
  const requestForChat = chat ? getRequestByTimestamp(chat.requestId) : undefined;
  const toolName =
    requestForChat &&
    typeof requestForChat.toolName === 'string' &&
    requestForChat.toolName.trim().length > 0
      ? requestForChat.toolName.trim()
      : 'Equipment request';
  const subtitle =
    other != null
      ? `${getProfileNameForUserId(other.userId)} • ⭐ ${getPublicProfileForView(
          other.userId
        ).ratingNumber.toFixed(1)}`
      : '';
  /** Same id `addChatMessage` uses as `senderId`. */
  const currentUserId = meId;

  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const visibleMessages = useMemo(
    () =>
      (chat?.messages ?? []).filter(
        (m) => typeof m.text === 'string' && m.text.trim() !== ''
      ),
    [chat?.messages]
  );
  const lastMessageId = visibleMessages.at(-1)?.id;

  const scrollToEnd = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!chatId) return;
      let cancelled = false;
      void (async () => {
        await syncChatWithSupabase(chatId, { bumpUnreadForNewIncoming: false });
        if (!cancelled) markChatRead(chatId);
      })();
      return () => {
        cancelled = true;
      };
    }, [chatId])
  );

  useEffect(() => {
    if (!chat || !meId) {
      return;
    }
    const peer = getOtherParticipant(chat, meId);
    const ids: string[] = [peer.userId, meId];
    for (const m of chat.messages) {
      if (m.senderId) ids.push(m.senderId);
      if (m.receiverId) ids.push(m.receiverId);
    }
    void prefetchProfileNamesForUserIds(ids);
  }, [chat, meId]);

  useEffect(() => {
    if (!chatId) {
      return;
    }
    const id = setInterval(() => {
      void syncChatWithSupabase(chatId, { bumpUnreadForNewIncoming: false });
    }, 2000);
    return () => clearInterval(id);
  }, [chatId]);

  useLayoutEffect(() => {
    if (!visibleMessages.length) return;
    scrollToEnd(true);
  }, [visibleMessages.length, lastMessageId, scrollToEnd]);

  const onSend = async () => {
    const text = draft.trim();
    if (!text || !chatId || isArchived) return;
    setDraft('');
    await addChatMessage(chatId, text);
    await syncChatWithSupabase(chatId, { bumpUnreadForNewIncoming: false });
    showFeedbackToast('Sent');
  };

  if (!chatId) {
    return (
      <KeyboardDismissScreen style={styles.screen}>
        <ScreenEntrance style={styles.entranceFlex}>
          <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
            <View style={styles.headerBackSlot}>
              <ScreenBackButton onPress={() => router.back()} />
            </View>
          </View>
          <View style={styles.center}>
            <Text style={styles.missing}>Missing chat.</Text>
          </View>
        </ScreenEntrance>
      </KeyboardDismissScreen>
    );
  }

  if (!chat) {
    return (
      <KeyboardDismissScreen style={styles.screen}>
        <ScreenEntrance style={styles.entranceFlex}>
          <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
            <View style={styles.headerBackSlot}>
              <ScreenBackButton onPress={() => router.back()} />
            </View>
          </View>
          <View style={styles.center}>
            <Text style={styles.missing}>This chat is not available.</Text>
          </View>
        </ScreenEntrance>
      </KeyboardDismissScreen>
    );
  }

  return (
    <KeyboardDismissScreen style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScreenEntrance style={styles.entranceFlex}>
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <View style={styles.headerBackSlot}>
            <ScreenBackButton onPress={() => router.back()} />
          </View>
          <View style={styles.headerTitleBlock}>
            <Text style={styles.title} numberOfLines={1}>
              {toolName}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle || 'Chat'}
            </Text>
            {isArchived ? (
              <Text style={styles.headerArchivedPill}>Archived</Text>
            ) : null}
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <FlatList
          ref={listRef}
          style={styles.messages}
          data={visibleMessages}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={[
            styles.messagesContent,
            visibleMessages.length === 0 ? styles.messagesEmpty : null,
            { paddingBottom: 12 + insets.bottom },
          ]}
          ListEmptyComponent={
            <Text style={styles.hint}>Say hi and coordinate pickup or delivery.</Text>
          }
          onContentSizeChange={() => scrollToEnd(true)}
          onLayout={() => {
            if (visibleMessages.length > 0) scrollToEnd(false);
          }}
          renderItem={({ item: message, index }) => {
            if (!isUserChatMessage(message) || !message.text || !message.text.trim()) {
              return null;
            }
            const isCurrentUser = message.senderId === currentUserId;
            const prev = index > 0 ? visibleMessages[index - 1] : null;
            const senderChanged = prev != null && prev.senderId !== message.senderId;
            if (__DEV__) {
              console.log('message sender:', message.senderId);
              console.log('current user:', currentUserId);
            }
            return (
              <View style={styles.messageRow}>
                <View
                  style={[
                    styles.messageStack,
                    isCurrentUser ? styles.messageStackRight : styles.messageStackLeft,
                    index > 0 &&
                      (senderChanged ? styles.messageStackNewSender : styles.messageStackSameSender),
                  ]}
                >
                  <View
                    style={[
                      styles.messageBubble,
                      isCurrentUser ? styles.right : styles.left,
                    ]}
                  >
                    <Text style={isCurrentUser ? styles.rightText : styles.leftText}>
                      {message.text}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.timestamp,
                      isCurrentUser ? styles.timestampRight : styles.timestampLeft,
                    ]}
                  >
                    {new Date(message.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              </View>
            );
          }}
        />

        {isArchived ? (
          <View style={[styles.archivedComposer, { paddingBottom: 12 + insets.bottom }]}>
            <Text style={styles.archivedComposerText}>
              This chat is archived. Sending is disabled after the rental is completed.
            </Text>
          </View>
        ) : (
          <View style={[styles.inputContainer, { paddingBottom: 10 + insets.bottom }]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Message…"
              placeholderTextColor={ui.textSecondary}
              style={styles.input}
              multiline
              maxLength={2000}
            />
            <Pressable
              pressOpacityFeedback={false}
              haptic
              onPress={onSend}
              hitSlop={12}
              style={({ pressed }) => [styles.sendBtn, pressed && styles.sendBtnPressed]}
              disabled={!draft.trim()}
            >
              <Text style={[styles.sendText, !draft.trim() && styles.sendTextDisabled]}>Send</Text>
            </Pressable>
          </View>
        )}
        </ScreenEntrance>
      </KeyboardAvoidingView>
    </KeyboardDismissScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: ui.surfaceGrouped,
  },
  entranceFlex: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  topBar: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
    backgroundColor: ui.surfaceGrouped,
  },
  headerBackSlot: {
    width: 64,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitleBlock: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 8,
    gap: 2,
  },
  title: {
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: ui.textPrimary,
    width: '100%',
  },
  subtitle: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '500',
    color: ui.textSecondary,
    width: '100%',
  },
  headerArchivedPill: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    color: ui.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  headerSpacer: {
    width: 64,
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    flexGrow: 1,
  },
  messagesEmpty: {
    justifyContent: 'center',
  },
  hint: {
    fontSize: 15,
    color: ui.textSubtle,
    textAlign: 'center',
    paddingTop: 24,
  },
  messageRow: {
    width: '100%',
  },
  messageStack: {
    maxWidth: '75%',
    marginBottom: 4,
  },
  messageStackNewSender: {
    marginTop: 10,
  },
  messageStackSameSender: {
    marginTop: 2,
  },
  messageStackRight: {
    alignSelf: 'flex-end',
  },
  messageStackLeft: {
    alignSelf: 'flex-start',
  },
  messageBubble: {
    padding: 10,
    borderRadius: 16,
  },
  right: {
    backgroundColor: ui.primary,
  },
  left: {
    backgroundColor: ui.border,
  },
  timestamp: {
    fontSize: 10,
    color: ui.textSecondary,
    marginTop: 2,
  },
  timestampRight: {
    textAlign: 'right',
  },
  timestampLeft: {
    textAlign: 'left',
  },
  rightText: {
    color: ui.primaryOn,
    fontSize: 16,
    lineHeight: 22,
  },
  leftText: {
    color: ui.textPrimary,
    fontSize: 16,
    lineHeight: 22,
  },
  archivedComposer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ui.border,
    backgroundColor: ui.surfaceGrouped,
  },
  archivedComposerText: {
    fontSize: 13,
    color: ui.textSubtle,
    textAlign: 'center',
    lineHeight: 18,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: ui.border,
    backgroundColor: ui.background,
  },
  input: {
    flex: 1,
    padding: 10,
    borderRadius: 20,
    backgroundColor: ui.surfaceInput,
    minHeight: 40,
    maxHeight: 120,
    fontSize: 16,
    color: ui.textPrimary,
  },
  sendBtn: {
    marginLeft: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minWidth: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: ui.radiusButton,
    overflow: 'hidden',
  },
  sendBtnPressed: {
    ...subtleControlPressed,
  },
  sendText: {
    fontSize: 17,
    fontWeight: '700',
    color: ui.primary,
  },
  sendTextDisabled: {
    color: ui.textSecondary,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  missing: {
    fontSize: 16,
    color: ui.textSubtle,
    textAlign: 'center',
  },
});
