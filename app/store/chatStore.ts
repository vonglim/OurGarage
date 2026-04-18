import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMemo, useRef, useSyncExternalStore } from 'react';

import { scheduleLocalNewMessageNotificationForTesting } from '../lib/notifications';
import { getPublicProfileForView, posterUserIdFromRequest } from '../lib/mockPublicProfiles';
import { addNotification } from './notificationsStore';
import { getOfferByRequestAndOfferTimestamp, getOfferUserPreview } from './offersStore';
import { getProfile } from './profileStore';
import { getRequestByTimestamp } from './requestsStore';

const STORAGE_KEY = '@ourgarage/chats_v1';

export type ChatParticipant = {
  userId: string;
  displayName: string;
};

export type ChatMessage = {
  id: string;
  senderId: string;
  text: string;
  timestamp: number;
};

export type Chat = {
  id: string;
  requestId: number;
  participants: [ChatParticipant, ChatParticipant];
  messages: ChatMessage[];
  createdAt: number;
  /** Set when the linked rental is completed; thread is read-only. */
  archived: boolean;
  /** Unread incoming message count per user id (recipient only; incremented on receive). */
  unreadCountByUserId: Record<string, number>;
};

let chats: Chat[] = [];
let version = 0;
const listeners = new Set<() => void>();
let loadStarted = false;

function emit() {
  version += 1;
  listeners.forEach((l) => l());
}

async function persist() {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch {
    /* ignore */
  }
}

function displayNameForUserId(userId: string): string {
  const me = getProfile();
  if (userId === me.userId) return me.name.trim() || 'You';
  return getPublicProfileForView(userId).name.trim() || userId;
}

function sortParticipants(a: ChatParticipant, b: ChatParticipant): [ChatParticipant, ChatParticipant] {
  return a.userId.localeCompare(b.userId) <= 0 ? [a, b] : [b, a];
}

/** Stable id for the counterparty when poster and offerer would otherwise be the same (single-device / bad data). */
const SYNTHETIC_CHAT_PEER_ID = 'user_2';

function withDistinctParticipants(a: ChatParticipant, b: ChatParticipant): [ChatParticipant, ChatParticipant] {
  if (a.userId !== b.userId) return sortParticipants(a, b);
  const synthetic: ChatParticipant = {
    userId: SYNTHETIC_CHAT_PEER_ID,
    displayName:
      getPublicProfileForView(SYNTHETIC_CHAT_PEER_ID).name.trim() || SYNTHETIC_CHAT_PEER_ID,
  };
  return sortParticipants(a, synthetic);
}

function normalizeLoaded(raw: unknown): Chat[] {
  if (!Array.isArray(raw)) return [];
  const out: Chat[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id : '';
    const requestId = typeof r.requestId === 'number' ? r.requestId : NaN;
    const createdAt = typeof r.createdAt === 'number' ? r.createdAt : 0;
    const parts = r.participants;
    if (!id || !Number.isFinite(requestId) || !Array.isArray(parts) || parts.length !== 2) continue;
    const p0 = parts[0] as Record<string, unknown>;
    const p1 = parts[1] as Record<string, unknown>;
    const u0 = typeof p0.userId === 'string' ? p0.userId : '';
    const u1 = typeof p1.userId === 'string' ? p1.userId : '';
    const n0 = typeof p0.displayName === 'string' ? p0.displayName : '';
    const n1 = typeof p1.displayName === 'string' ? p1.displayName : '';
    if (!u0 || !u1) continue;
    const [pa, pb] = withDistinctParticipants(
      { userId: u0, displayName: n0 || u0 },
      { userId: u1, displayName: n1 || u1 }
    );
    const messagesRaw = r.messages;
    const messages: ChatMessage[] = [];
    if (Array.isArray(messagesRaw)) {
      for (const m of messagesRaw) {
        if (!m || typeof m !== 'object') continue;
        const msg = m as Record<string, unknown>;
        const mid = typeof msg.id === 'string' ? msg.id : '';
        const senderId = typeof msg.senderId === 'string' ? msg.senderId : '';
        const text = typeof msg.text === 'string' ? msg.text : '';
        const ts = typeof msg.timestamp === 'number' ? msg.timestamp : 0;
        if (mid && senderId && text && ts) {
          messages.push({ id: mid, senderId, text, timestamp: ts });
        }
      }
    }
    messages.sort((a, b) => a.timestamp - b.timestamp);
    const archived = r.archived === true;
    const unreadRaw = r.unreadCountByUserId;
    const unreadCountByUserId: Record<string, number> = {};
    if (unreadRaw && typeof unreadRaw === 'object' && !Array.isArray(unreadRaw)) {
      for (const [k, v] of Object.entries(unreadRaw)) {
        if (typeof v === 'number' && Number.isFinite(v) && v > 0) unreadCountByUserId[k] = Math.floor(v);
      }
    }
    out.push({
      id,
      requestId,
      participants: [pa, pb],
      messages,
      createdAt,
      archived,
      unreadCountByUserId,
    });
  }
  return out;
}

async function loadFromStorage() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      chats = normalizeLoaded(JSON.parse(raw));
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

export function subscribeChats(listener: () => void) {
  ensureLoad();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getVersion(): number {
  ensureLoad();
  return version;
}

export function getChats(): Chat[] {
  ensureLoad();
  return [...chats];
}

export function getChatById(chatId: string): Chat | undefined {
  ensureLoad();
  return chats.find((c) => c.id === chatId);
}

/** Stable id: one conversation per request (`requestId` = request `timestamp`). No duplicates. */
export function chatIdForRequest(requestTimestamp: number): string {
  return `req-${requestTimestamp}`;
}

/**
 * Create or return existing chat for a matched request (offer accepted).
 */
export function ensureChatForAcceptedOffer(
  requestTimestamp: number,
  acceptedOfferTimestamp: number
): string | null {
  ensureLoad();
  const req = getRequestByTimestamp(requestTimestamp);
  if (!req?.matched) return null;
  const offer = getOfferByRequestAndOfferTimestamp(requestTimestamp, acceptedOfferTimestamp);
  if (!offer) return null;

  const id = chatIdForRequest(requestTimestamp);
  if (chats.some((c) => c.id === id)) return id; // reuse existing thread for this request

  const posterId =
    typeof req.posterUserId === 'string' && req.posterUserId.length > 0
      ? req.posterUserId
      : posterUserIdFromRequest(req.timestamp ?? null);
  const preview = getOfferUserPreview(offer);
  const offererId = preview.userId;

  const a: ChatParticipant = { userId: posterId, displayName: displayNameForUserId(posterId) };
  const b: ChatParticipant = { userId: offererId, displayName: preview.name };
  const participants = withDistinctParticipants(a, b);

  const now = Date.now();
  chats = [
    {
      id,
      requestId: requestTimestamp,
      participants,
      messages: [],
      createdAt: now,
      archived: false,
      unreadCountByUserId: {},
    },
    ...chats,
  ];
  emit();
  void persist();
  return id;
}

export function ensureChatForMatchedRequest(requestTimestamp: number): string | null {
  const req = getRequestByTimestamp(requestTimestamp);
  if (!req?.matched || req.acceptedOfferTimestamp == null) return null;
  return ensureChatForAcceptedOffer(requestTimestamp, req.acceptedOfferTimestamp);
}

/** Call when rental completes (e.g. after `markRequestRentalComplete`). No-op if no chat row. */
export function archiveChatForRequest(requestTimestamp: number): void {
  ensureLoad();
  const id = chatIdForRequest(requestTimestamp);
  if (!chats.some((c) => c.id === id)) return;
  chats = chats.map((c) => (c.id === id ? { ...c, archived: true } : c));
  emit();
  void persist();
}

export function addChatMessage(chatId: string, text: string): void {
  const trimmed = text.trim();
  if (trimmed === '') return;
  ensureLoad();
  const existing = chats.find((c) => c.id === chatId);
  if (existing?.archived) return;
  const currentUserId = getProfile().userId;
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const msg: ChatMessage = {
    id,
    senderId: currentUserId,
    text: trimmed,
    timestamp: Date.now(),
  };
  let requestIdForNotif: number | null = null;
  chats = chats.map((c) => {
    if (c.id !== chatId) return c;
    requestIdForNotif = c.requestId;
    const recipient = getOtherParticipant(c, currentUserId);
    const prevUnread = c.unreadCountByUserId?.[recipient.userId] ?? 0;
    return {
      ...c,
      messages: [...c.messages, msg],
      unreadCountByUserId: {
        ...(c.unreadCountByUserId ?? {}),
        [recipient.userId]: prevUnread + 1,
      },
    };
  });
  emit();
  void persist();
  void scheduleLocalNewMessageNotificationForTesting(trimmed);
  if (requestIdForNotif != null && existing) {
    const other = getOtherParticipant(existing, currentUserId);
    const senderName = getProfile().name.trim() || 'Someone';
    const preview =
      trimmed.length > 200 ? `${trimmed.slice(0, 197)}…` : trimmed;
    addNotification({
      type: 'message',
      message: `${senderName}: ${preview}`,
      requestId: requestIdForNotif,
      chatId,
      forUserId: other.userId,
    });
  }
}

/**
 * DEV ONLY: append a message with an explicit sender (e.g. simulate the other party).
 * No-ops in production (`__DEV__` is false).
 */
export function addMessage(chatId: string, msg: ChatMessage): void {
  if (!__DEV__) return;
  ensureLoad();
  const existing = chats.find((c) => c.id === chatId);
  if (!existing || existing.archived) return;
  const trimmed = msg.text.trim();
  if (!trimmed) return;
  const senderOk = existing.participants.some((p) => p.userId === msg.senderId);
  if (!senderOk) return;
  const message: ChatMessage = {
    ...msg,
    id: msg.id || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    text: trimmed,
    timestamp: typeof msg.timestamp === 'number' && msg.timestamp > 0 ? msg.timestamp : Date.now(),
  };
  chats = chats.map((c) => {
    if (c.id !== chatId) return c;
    const recipient = getOtherParticipant(c, message.senderId);
    const prevUnread = c.unreadCountByUserId?.[recipient.userId] ?? 0;
    return {
      ...c,
      messages: [...c.messages, message],
      unreadCountByUserId: {
        ...(c.unreadCountByUserId ?? {}),
        [recipient.userId]: prevUnread + 1,
      },
    };
  });
  emit();
  void persist();
  void scheduleLocalNewMessageNotificationForTesting(trimmed);
}

export function getLastMessagePreview(chat: Chat): string {
  if (chat.messages.length === 0) return 'No messages yet';
  const last = chat.messages[chat.messages.length - 1];
  return last.text;
}

export function getOtherParticipant(chat: Chat, myUserId: string): ChatParticipant {
  const [p0, p1] = chat.participants;
  if (p0.userId === myUserId) return p1;
  if (p1.userId === myUserId) return p0;
  return p0;
}

/** Unread count for this user (incoming messages not yet opened in this chat). */
export function getUnreadCountForUser(chat: Chat, userId: string): number {
  const n = chat.unreadCountByUserId?.[userId];
  return typeof n === 'number' && n > 0 ? n : 0;
}

/** Mark current user's chat as read (call when opening the thread). */
export function markChatRead(chatId: string): void {
  ensureLoad();
  const me = getProfile().userId;
  chats = chats.map((c) =>
    c.id === chatId
      ? {
          ...c,
          unreadCountByUserId: { ...(c.unreadCountByUserId ?? {}), [me]: 0 },
        }
      : c
  );
  emit();
  void persist();
}

export function listChatsSortedByLatest(): Chat[] {
  ensureLoad();
  return [...chats].sort((a, b) => {
    const ta = a.messages.length ? a.messages[a.messages.length - 1].timestamp : a.createdAt;
    const tb = b.messages.length ? b.messages[b.messages.length - 1].timestamp : b.createdAt;
    return tb - ta;
  });
}

export type ChatStoreState = {
  chats: Chat[];
};

function getChatStoreState(): ChatStoreState {
  return { chats: listChatsSortedByLatest() };
}

/**
 * Subscribe to chat store; selector runs on each store update (new messages, etc.).
 * Example: `const chats = useChatStore((s) => s.chats);`
 */
export function useChatStore<T>(selector: (state: ChatStoreState) => T): T {
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const v = useSyncExternalStore(subscribeChats, getVersion, getVersion);
  return useMemo(() => selectorRef.current(getChatStoreState()), [v]);
}

export function useChats(): Chat[] {
  return useChatStore((state) => state.chats);
}
