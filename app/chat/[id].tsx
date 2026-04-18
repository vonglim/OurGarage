import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from '../components/KeyboardDismissScreen';
import {
  addChatMessage,
  getOtherParticipant,
  markChatRead,
  useChatStore,
  type ChatMessage,
} from '../store/chatStore';
import { getProfile } from '../store/profileStore';
import { ui } from '@/constants/appUi';

export default function ChatDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const chatId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '';
  const chats = useChatStore((state) => state.chats);
  const chat = chats.find((c) => c.id === chatId);
  const me = getProfile();
  const other = chat ? getOtherParticipant(chat, me.userId) : null;
  const isArchived = chat ? chat.archived === true : false;

  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const lastMessageId = chat?.messages?.at(-1)?.id;

  const scrollToEnd = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (chatId) markChatRead(chatId);
    }, [chatId])
  );

  useLayoutEffect(() => {
    if (!chat?.messages.length) return;
    scrollToEnd(true);
  }, [chat?.messages.length, lastMessageId, scrollToEnd]);

  const onSend = () => {
    const text = draft.trim();
    if (!text || !chatId || isArchived) return;
    addChatMessage(chatId, text);
    setDraft('');
  };

  if (!chatId) {
    return (
      <KeyboardDismissScreen style={styles.screen}>
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>
        </View>
        <View style={styles.center}>
          <Text style={styles.missing}>Missing chat.</Text>
        </View>
      </KeyboardDismissScreen>
    );
  }

  if (!chat) {
    return (
      <KeyboardDismissScreen style={styles.screen}>
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>
        </View>
        <View style={styles.center}>
          <Text style={styles.missing}>This chat is not available.</Text>
        </View>
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
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>
          <View style={styles.headerTitleBlock}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {other?.displayName ?? 'Chat'}
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
          data={chat.messages}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={[
            styles.messagesContent,
            chat.messages.length === 0 ? styles.messagesEmpty : null,
            { paddingBottom: 12 + insets.bottom },
          ]}
          ListEmptyComponent={
            <Text style={styles.hint}>Say hi and coordinate pickup or delivery.</Text>
          }
          onContentSizeChange={() => scrollToEnd(true)}
          onLayout={() => {
            if (chat.messages.length > 0) scrollToEnd(false);
          }}
          renderItem={({ item: m }) => {
            const mine = m.senderId === me.userId;
            return (
              <View
                style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}
              >
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={[styles.bubbleText, mine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}>
                    {m.text}
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
          <View style={[styles.composer, { paddingBottom: 10 + insets.bottom }]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Message…"
              placeholderTextColor="#8E8E93"
              style={styles.input}
              multiline
              maxLength={2000}
            />
            <Pressable
              onPress={onSend}
              style={({ pressed }) => [styles.sendBtn, pressed && styles.sendBtnPressed]}
              disabled={!draft.trim()}
            >
              <Text style={[styles.sendText, !draft.trim() && styles.sendTextDisabled]}>Send</Text>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </KeyboardDismissScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F2F2F7',
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
    borderBottomColor: '#E5E5EA',
    backgroundColor: '#F2F2F7',
  },
  back: {
    fontSize: 17,
    color: ui.primary,
    fontWeight: '600',
  },
  headerTitleBlock: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  headerTitle: {
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#000',
    width: '100%',
  },
  headerArchivedPill: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    color: '#636366',
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
  bubbleRow: {
    width: '100%',
    marginBottom: 10,
  },
  bubbleRowMine: {
    alignItems: 'flex-end',
  },
  bubbleRowTheirs: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  bubbleMine: {
    backgroundColor: ui.primary,
  },
  bubbleTheirs: {
    backgroundColor: '#E5E5EA',
  },
  bubbleText: {
    fontSize: 16,
    lineHeight: 22,
  },
  bubbleTextMine: {
    color: '#FFFFFF',
  },
  bubbleTextTheirs: {
    color: '#000',
  },
  archivedComposer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5EA',
    backgroundColor: '#F2F2F7',
  },
  archivedComposerText: {
    fontSize: 13,
    color: ui.textSubtle,
    textAlign: 'center',
    lineHeight: 18,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D1D1D6',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#000',
    backgroundColor: '#F2F2F7',
  },
  sendBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sendBtnPressed: {
    opacity: 0.6,
  },
  sendText: {
    fontSize: 17,
    fontWeight: '700',
    color: ui.primary,
  },
  sendTextDisabled: {
    color: '#C7C7CC',
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
