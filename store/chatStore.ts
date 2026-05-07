import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMemo, useRef, useSyncExternalStore } from 'react';

import { nextLocalId } from '@/lib/idFactory';
import { isSupabaseConfigured } from '@/lib/supabase';
import { scheduleLocalNewMessageNotificationForTesting } from '@/lib/notifications';
import { getProfileNameForUserId } from '@/lib/profileDisplayName';
import { getPublicProfileForView } from '@/lib/publicProfiles';
import { getRequestOwnerId, getRequestSupabaseRowId } from '@/lib/requestOwnership';
import {
  fetchRequestChatMessagesFromSupabase,
  OFFER_USER_CHAT_MESSAGE_KIND,
} from '@/lib/supabaseRequestChatMessages';
import { sendOfferThreadUserMessage } from '@/lib/sendOfferThreadMessage';
import { getOfferById, getOfferUserPreview } from './offersStore';
import { getAuthUserIdSync, useAuthUserId } from '@/lib/authUser';
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
  /** The intended recipient of this message (the other user in the thread). */
  receiverId: string;
  /** App request `timestamp` (not Supabase uuid). */
  requestId: number;
  offerId: string;
  text: string;
  /**
   * Mirrors `offer_messages.kind` from Supabase; only `user_chat` is shown in the DM thread
   * (system rows like `initial` / `poster_counter` are omitted).
   */
  kind?: string;
  /** From `offer_messages.offer_images` (Supabase). Sync sets `[]` when the column is missing or not an array. */
  offer_images?: string[];
  /** MS since epoch; mirrors `createdAt` for list ordering. */
  timestamp: number;
  createdAt: number;
};

function parseOfferImageUrls(row: Record<string, unknown>): string[] {
  const raw = row.offer_images;

  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
  }

  // handle stringified arrays (Supabase sometimes returns this)
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
      }
    } catch {}
  }

  return [];
}

/** Rows we merge into the in-app thread (post-accept DMs + negotiation rows with text or images). */
function offerMessageRowVisibleInThread(row: Record<string, unknown>): boolean {
  const b = row.body == null ? '' : String(row.body).trim();
  const k = String((row as { kind?: string | null }).kind ?? '');
  const imgs = parseOfferImageUrls(row);
  const hasContent = b !== '' || imgs.length > 0;
  if (!hasContent) return false;
  if (k === OFFER_USER_CHAT_MESSAGE_KIND) return true;
  return (
    k === 'initial' ||
    k === 'renter_update' ||
    k === 'poster_counter' ||
    k === 'renter_accepts'
  );
}

/** True for post-accept user DMs; also true when `kind` is missing (legacy storage before the field). */
export function isUserChatMessage(m: ChatMessage): boolean {
  const k = m.kind ?? '';
  if (k === OFFER_USER_CHAT_MESSAGE_KIND || k === '') return true;
  if (Array.isArray(m.offer_images) && m.offer_images.length > 0) return true;
  if (
    (k === 'initial' || k === 'renter_update' || k === 'poster_counter' || k === 'renter_accepts') &&
    (m.text.trim() !== '' || (m.offer_images != null && m.offer_images.length > 0))
  ) {
    return true;
  }
  return false;
}

export type Chat = {
  id: string;
  requestId: number;
  /** Matched offer id (Supabase uuid) for the thread. */
  offerId: string;
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
let loadPromise: Promise<void> | null = null;

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
  if (userId === SYNTHETIC_CHAT_PEER_ID) return '—';
  return getProfileNameForUserId(userId);
}

function sortParticipants(a: ChatParticipant, b: ChatParticipant): [ChatParticipant, ChatParticipant] {
  return a.userId.localeCompare(b.userId) <= 0 ? [a, b] : [b, a];
}

/** Fixed id when poster and offerer would otherwise be the same (single-device / bad data). */
const SYNTHETIC_CHAT_PEER_ID = 'synthetic_peer';

function withDistinctParticipants(a: ChatParticipant, b: ChatParticipant): [ChatParticipant, ChatParticipant] {
  if (a.userId !== b.userId) return sortParticipants(a, b);
  const synthetic: ChatParticipant = {
    userId: SYNTHETIC_CHAT_PEER_ID,
    displayName: '—',
  };
  return sortParticipants(a, synthetic);
}

function isPendingOptimisticMessageId(id: string): boolean {
  return id.startsWith('opt_');
}

/** If the server already has a row for this in-flight or failed local bubble, do not also keep the `opt_` copy. */
function isPendingSupersededByServer(local: ChatMessage, server: ChatMessage[]): boolean {
  return server.some(
    (s) =>
      s.senderId === local.senderId &&
      s.text === local.text &&
      Math.abs(s.timestamp - local.timestamp) < 6 * 60_000
  );
}

/**
 * Poster = `request.posterUserId` (falls back to legacy owner fields), renter = `offer.renterId`.
 * Receiver is always the other party in the thread, never the sender.
 */
function getRequestPosterId(req: Record<string, unknown>): string {
  const a = req.posterUserId ?? (req as { poster_user_id?: string }).poster_user_id;
  if (typeof a === 'string' && a.trim() !== '') return a.trim();
  return (getRequestOwnerId(req) ?? '').trim();
}

/**
 * Given request poster + this thread’s offer renter, the counterparty for a DM.
 * `senderId === posterUserId` → receiver is `renterId`; else sender is the renter → receiver is the poster.
 */
function resolveChatReceiverId(
  senderId: string,
  posterUserId: string,
  renterId: string
): string | null {
  const s = senderId.trim();
  const p = posterUserId.trim();
  const r = renterId.trim();
  if (!p || !r) return null;
  if (p === r) return null;
  if (s === p) return r;
  if (s === r) return p;
  return null;
}

function normalizeLoaded(raw: unknown): Chat[] {
  if (!Array.isArray(raw)) return [];
  const out: Chat[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id : '';
    const requestId = typeof r.requestId === 'number' ? r.requestId : NaN;
    const offerId =
      typeof (r as { offerId?: unknown }).offerId === 'string' &&
      String((r as { offerId: string }).offerId).trim() !== ''
        ? String((r as { offerId: string }).offerId).trim()
        : '';
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
        const offer_images = Array.isArray(msg.offer_images) ? msg.offer_images : [];
        const hasContent = text.trim() !== '' || offer_images.length > 0;
        if (mid && senderId && hasContent && ts) {
          const rec: string =
            typeof msg.receiverId === 'string' && msg.receiverId.length > 0
              ? msg.receiverId
              : u0 === senderId
                ? u1
                : u1 === senderId
                  ? u0
                  : u1;
          const oid =
            typeof msg.offerId === 'string' && msg.offerId.length > 0
              ? msg.offerId
              : (typeof offerId === 'string' && offerId ? offerId : 'legacy');
          const rApp =
            typeof msg.requestId === 'number' && Number.isFinite(msg.requestId) ? msg.requestId : requestId;
          const created = typeof (msg as { createdAt?: unknown }).createdAt === 'number' ? (msg as { createdAt: number }).createdAt : ts;
          const k =
            typeof (msg as { kind?: unknown }).kind === 'string'
              ? String((msg as { kind: string }).kind)
              : OFFER_USER_CHAT_MESSAGE_KIND;
          messages.push({
            id: mid,
            senderId,
            receiverId: rec,
            text,
            requestId: rApp,
            offerId: oid,
            kind: k,
            offer_images,
            timestamp: ts,
            createdAt: created,
          });
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
      offerId: offerId || 'legacy',
      participants: [pa, pb],
      messages,
      createdAt,
      archived,
      unreadCountByUserId,
    });
  }
  return out;
}

/** Merges AsyncStorage snapshot with in-memory `chats` so a slow load never drops messages sent before hydration. */
function mergeChatsFromStorageWithMemory(loaded: Chat[], memory: Chat[]): Chat[] {
  const lBy = new Map(loaded.map((c) => [c.id, c]));
  const mBy = new Map(memory.map((c) => [c.id, c]));
  const ids = new Set([...lBy.keys(), ...mBy.keys()]);
  const out: Chat[] = [];
  for (const id of ids) {
    const l = lBy.get(id);
    const m = mBy.get(id);
    if (l && !m) {
      out.push(l);
    } else if (m && !l) {
      out.push(m);
    } else if (l && m) {
      const byMsg = new Map<string, ChatMessage>();
      for (const x of l.messages) {
        byMsg.set(x.id, x);
      }
      for (const x of m.messages) {
        if (!byMsg.has(x.id)) {
          byMsg.set(x.id, x);
        }
      }
      const messages = [...byMsg.values()].sort((a, b) => a.timestamp - b.timestamp);
      out.push({
        ...l,
        ...m,
        offerId: m.offerId && m.offerId !== 'legacy' ? m.offerId : l.offerId,
        messages,
        participants: m.participants,
        archived: m.archived || l.archived,
        unreadCountByUserId: { ...l.unreadCountByUserId, ...m.unreadCountByUserId },
        createdAt: Math.min(l.createdAt, m.createdAt),
      });
    }
  }
  return out;
}

async function loadFromStorage() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const loaded = normalizeLoaded(JSON.parse(raw));
      if (chats.length === 0) {
        chats = loaded;
      } else {
        chats = mergeChatsFromStorageWithMemory(loaded, chats);
      }
    }
  } catch {
    /* ignore */
  }
  emit();
}

function ensureLoad() {
  if (loadPromise == null) {
    loadPromise = loadFromStorage();
  }
}

async function waitForChatsHydrated(): Promise<void> {
  ensureLoad();
  await loadPromise;
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

/** Wipe all chat threads and persist (dev / testing clean slate). */
export function clearAllChats(): void {
  ensureLoad();
  chats = [];
  emit();
  void persist();
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
  acceptedOfferId: string
): string | null {
  ensureLoad();
  const req = getRequestByTimestamp(requestTimestamp);
  if (!req?.matched) return null;
  const offer = getOfferById(acceptedOfferId);
  if (!offer) return null;

  const id = chatIdForRequest(requestTimestamp);
  if (chats.some((c) => c.id === id)) {
    let changed = false;
    const oid = String(acceptedOfferId).trim();
    chats = chats.map((c) => {
      if (c.id === id && (!c.offerId || c.offerId === 'legacy')) {
        changed = true;
        return { ...c, offerId: oid };
      }
      return c;
    });
    if (changed) {
      emit();
      void persist();
    }
    return id;
  }

  const posterId =
    getRequestPosterId(req as Record<string, unknown>) || '';
  const preview = getOfferUserPreview(offer);
  const offererId = preview.userId;

  const a: ChatParticipant = { userId: posterId, displayName: displayNameForUserId(posterId) };
  const b: ChatParticipant = { userId: offererId, displayName: preview.name };
  const ordered: [ChatParticipant, ChatParticipant] =
    posterId === offererId
      ? withDistinctParticipants(a, b)
      : ([a, b] as [ChatParticipant, ChatParticipant]);

  const now = Date.now();
  chats = [
    {
      id,
      requestId: requestTimestamp,
      offerId: String(acceptedOfferId).trim(),
      participants: ordered,
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
  if (!req?.matched || req.acceptedOfferId == null || req.acceptedOfferId === '') return null;
  return ensureChatForAcceptedOffer(requestTimestamp, String(req.acceptedOfferId));
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

export async function addChatMessage(chatId: string, text: string): Promise<void> {
  if (!text || !text.trim()) return;
  const trimmed = text.trim();
  await waitForChatsHydrated();
  ensureLoad();
  const existing = chats.find((c) => c.id === chatId);
  if (!existing || existing.archived) return;
  const userId = getAuthUserIdSync().trim();
  const req = getRequestByTimestamp(existing.requestId);
  if (req == null) return;
  const posterUserId = getRequestPosterId(req as Record<string, unknown>);
  const offerIdForThread =
    existing.offerId && existing.offerId !== 'legacy'
      ? existing.offerId
      : typeof (req as { acceptedOfferId?: string }).acceptedOfferId === 'string'
        ? String((req as { acceptedOfferId: string }).acceptedOfferId).trim()
        : '';
  const offer = offerIdForThread ? getOfferById(offerIdForThread) : null;
  if (offer == null) {
    if (__DEV__) console.warn('[chat] addChatMessage: no offer for thread');
    return;
  }
  const renterId = String(offer.renterId ?? '').trim();
  if (!posterUserId || !renterId) {
    if (__DEV__) console.warn('[chat] addChatMessage: missing poster or renter', { posterUserId, renterId });
    return;
  }
  if (posterUserId === renterId) {
    if (__DEV__) console.warn('[chat] addChatMessage: poster and renter are the same user id');
    return;
  }
  if (userId !== posterUserId && userId !== renterId) {
    if (__DEV__) console.warn('[chat] addChatMessage: sender is not poster or renter', {
      userId,
      posterUserId,
      renterId,
    });
    return;
  }
  const senderId = userId;
  const receiverId = resolveChatReceiverId(senderId, posterUserId, renterId);
  if (receiverId == null || receiverId === senderId) {
    if (__DEV__) {
      console.warn('[chat] addChatMessage: could not resolve a distinct receiver', {
        senderId,
        posterUserId,
        renterId,
        receiverId,
      });
    }
    return;
  }
  const offerIdStr = String(offer.id).trim();
  const now = Date.now();
  const optimisticId = nextLocalId('opt');
  const optimistic: ChatMessage = {
    id: optimisticId,
    senderId,
    receiverId,
    text: trimmed,
    requestId: existing.requestId,
    offerId: offerIdStr,
    kind: OFFER_USER_CHAT_MESSAGE_KIND,
    offer_images: [],
    timestamp: now,
    createdAt: now,
  };
  chats = chats.map((c) => {
    if (c.id !== chatId) return c;
    return {
      ...c,
      offerId: c.offerId && c.offerId !== 'legacy' ? c.offerId : offerIdStr,
      messages: [...c.messages, optimistic],
    };
  });
  emit();
  void persist();

  if (!isSupabaseConfigured() || !offerIdStr) {
    return;
  }
  const requestRowId = getRequestSupabaseRowId(req as Record<string, unknown>);
  const res = await sendOfferThreadUserMessage({
    requestRowId: requestRowId ? requestRowId : undefined,
    offerId: offerIdStr,
    authorId: senderId,
    receiverId,
    body: trimmed,
  });
  if (__DEV__) {
    console.log('INSERT RESULT', res);
  }
  if (res.error != null) {
    console.error('Message insert failed', res.error);
    return;
  }
  if (res.messageId == null || res.messageId === '') {
    console.error('Message insert failed: empty id in response', res);
    return;
  }
  const serverId = res.messageId;
  chats = chats.map((c) => {
    if (c.id !== chatId) return c;
    const replaced = c.messages.map((m) => (m.id === optimisticId ? { ...m, id: serverId } : m));
    const prevUnread = c.unreadCountByUserId?.[receiverId] ?? 0;
    return {
      ...c,
      offerId: c.offerId && c.offerId !== 'legacy' ? c.offerId : offerIdStr,
      messages: replaced,
      unreadCountByUserId: {
        ...(c.unreadCountByUserId ?? {}),
        [receiverId]: prevUnread + 1,
      },
    };
  });
  emit();
  void persist();
  void scheduleLocalNewMessageNotificationForTesting(trimmed);
  await syncChatWithSupabase(chatId, { bumpUnreadForNewIncoming: false });
}

/**
 * Load full `offer_messages` for this request+offer from Supabase, then keep only `kind === user_chat`
 * for the in-app thread (negotiation rows are dropped). `sender`/`receiver` are derived for bubble display.
 */
export async function syncChatWithSupabase(
  chatId: string,
  options?: { bumpUnreadForNewIncoming?: boolean }
): Promise<void> {
  ensureLoad();
  if (!isSupabaseConfigured()) return;
  const chat = chats.find((c) => c.id === chatId);
  if (chat == null) return;
  const req = getRequestByTimestamp(chat.requestId);
  if (req == null) return;
  const offerFromChat = chat.offerId && chat.offerId !== 'legacy' ? chat.offerId.trim() : '';
  const fromReq =
    typeof (req as { acceptedOfferId?: string | null }).acceptedOfferId === 'string'
      ? String((req as { acceptedOfferId: string }).acceptedOfferId).trim()
      : '';
  const offerUuid = (offerFromChat || fromReq).trim();
  if (offerUuid === '') return;
  const off = getOfferById(offerUuid);
  if (off == null) return;
  const requestRowId = getRequestSupabaseRowId(req as Record<string, unknown>);
  const posterUserId = getRequestPosterId(req as Record<string, unknown>);
  const renter = off.renterId.trim();
  if (!posterUserId || !renter) return;
  if (posterUserId === renter) {
    if (__DEV__) {
      console.warn('[chat] sync: poster and renter are the same user id; skipping');
    }
    return;
  }
  const rows = await fetchRequestChatMessagesFromSupabase(requestRowId, offerUuid);
  if (rows == null) {
    return;
  }
  if (__DEV__) {
    console.log('SYNC RESULT COUNT', rows.length);
  }
  if (rows.length === 0) {
    if (__DEV__) {
      console.log('[chat] cleanup stale local thread: backend has zero offer_messages', {
        chatId,
        offerUuid,
      });
    }
    chats = chats.filter((c) => c.id !== chatId);
    emit();
    void persist();
    return;
  }
  const me = getAuthUserIdSync().trim();
  const appRequestId = chat.requestId;
  const oldIds = new Set(chat.messages.map((m) => m.id));
  const bump = options?.bumpUnreadForNewIncoming ?? true;
  const fromServer: ChatMessage[] = rows
    .filter((row) => offerMessageRowVisibleInThread(row as Record<string, unknown>))
    .flatMap((row) => {
      console.log('SYNC ROW:', row.offer_images);
      const created = Date.parse(String(row.created_at)) || 0;
      const author = (row.author_id ?? '').trim();
      if (!author) {
        if (__DEV__) {
          console.warn('[chat] sync: skipping row with no author_id', (row as { id?: string }).id);
        }
        return [];
      }
      const offerIdFromRow = typeof row.offer_id === 'string' ? row.offer_id.trim() : String(row.offer_id ?? offerUuid);
      const receiverId = resolveChatReceiverId(author, posterUserId, renter);
      if (receiverId == null) {
        if (__DEV__) {
          console.warn('[chat] sync: could not resolve receiver; skipping row', {
            author,
            id: (row as { id?: string }).id,
          });
        }
        return [];
      }
      if (receiverId === author) {
        if (__DEV__) {
          console.warn('[chat] sync: resolved receiver === author; skipping row', { id: (row as { id?: string }).id });
        }
        return [];
      }
      const m: ChatMessage = {
        id: String(row.id),
        senderId: author,
        receiverId,
        text: String(row.body ?? '').trim(),
        requestId: appRequestId,
        offerId: offerIdFromRow,
        kind: String((row as { kind?: string | null }).kind ?? OFFER_USER_CHAT_MESSAGE_KIND),
        offer_images: parseOfferImageUrls(row as Record<string, unknown>),
        timestamp: created,
        createdAt: created,
      };
      return [m];
    });
  const pending = chat.messages.filter(
    (m) =>
      isPendingOptimisticMessageId(m.id) && !isPendingSupersededByServer(m, fromServer)
  );
  const mergedById = new Map<string, ChatMessage>();
  for (const m of fromServer) {
    mergedById.set(m.id, m);
  }
  for (const m of pending) {
    if (!mergedById.has(m.id)) {
      mergedById.set(m.id, m);
    }
  }
  const incoming = [...mergedById.values()].sort((a, b) => a.timestamp - b.timestamp);
  if (incoming.length === 0) {
    return;
  }

  let newUnread: Record<string, number> = { ...(chat.unreadCountByUserId ?? {}) };
  if (bump) {
    for (const m of incoming) {
      if (!oldIds.has(m.id) && m.receiverId === me) {
        newUnread[me] = (newUnread[me] ?? 0) + 1;
      }
    }
  }

  const firstOffer = incoming[0]?.offerId;
  chats = chats.map((c) => {
    if (c.id !== chatId) return c;
    return {
      ...c,
      offerId: firstOffer && firstOffer.length > 0 && c.offerId === 'legacy' ? firstOffer : c.offerId,
      messages: incoming,
      unreadCountByUserId: newUnread,
    };
  });
  emit();
  void persist();
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
  const other = getOtherParticipant(existing, msg.senderId);
  const ts = typeof msg.timestamp === 'number' && msg.timestamp > 0 ? msg.timestamp : Date.now();
  const oid = existing.offerId && existing.offerId !== 'legacy' ? existing.offerId : '';
  const message: ChatMessage = {
    ...msg,
    id: msg.id || nextLocalId('msg'),
    text: trimmed,
    kind: msg.kind ?? OFFER_USER_CHAT_MESSAGE_KIND,
    receiverId: (msg.receiverId ?? '').trim() || other.userId,
    requestId: typeof msg.requestId === 'number' && Number.isFinite(msg.requestId) ? msg.requestId : existing.requestId,
    offerId: (msg.offerId ?? '').trim() || (oid || 'legacy'),
    offer_images: Array.isArray(msg.offer_images) ? msg.offer_images : [],
    timestamp: ts,
    createdAt: typeof msg.createdAt === 'number' && msg.createdAt > 0 ? msg.createdAt : ts,
  };
  if (oid) {
    const req0 = getRequestByTimestamp(existing.requestId);
    const o = getOfferById(oid);
    if (req0 && o) {
      const posterUserId = getRequestPosterId(req0 as Record<string, unknown>);
      const r = o.renterId.trim();
      if (posterUserId && r && posterUserId !== r) {
        const resolved = resolveChatReceiverId(message.senderId, posterUserId, r);
        if (resolved != null && resolved !== message.senderId) {
          message.receiverId = resolved;
        }
      }
    }
  }
  const recipientIdForUnread = message.receiverId;
  chats = chats.map((c) => {
    if (c.id !== chatId) return c;
    const prevUnread = c.unreadCountByUserId?.[recipientIdForUnread] ?? 0;
    return {
      ...c,
      messages: [...c.messages, message],
      unreadCountByUserId: {
        ...(c.unreadCountByUserId ?? {}),
        [recipientIdForUnread]: prevUnread + 1,
      },
    };
  });
  emit();
  void persist();
  void scheduleLocalNewMessageNotificationForTesting(trimmed);
}

export function getLastMessagePreview(chat: Chat): string {
  const list = chat.messages.filter(isUserChatMessage);
  if (list.length === 0) return 'No messages yet';
  return list[list.length - 1].text;
}

function participantWithResolvedName(p: ChatParticipant): ChatParticipant {
  if (p.userId === SYNTHETIC_CHAT_PEER_ID) {
    return { userId: p.userId, displayName: '—' };
  }
  return { userId: p.userId, displayName: displayNameForUserId(p.userId) };
}

export function getOtherParticipant(chat: Chat, myUserId: string): ChatParticipant {
  const m = (myUserId || '').trim();
  const [p0, p1] = chat.participants;
  if (p0.userId === m && p1.userId !== m) return participantWithResolvedName(p1);
  if (p1.userId === m && p0.userId !== m) return participantWithResolvedName(p0);
  if (p0.userId !== p1.userId) {
    if (m === p0.userId) return participantWithResolvedName(p1);
    if (m === p1.userId) return participantWithResolvedName(p0);
  }
  // Same id on both sides, synthetic peer, or unknown: resolve from request + offer
  const req = getRequestByTimestamp(chat.requestId);
  const acc =
    req && typeof (req as { acceptedOfferId?: string | null }).acceptedOfferId === 'string'
      ? (req as { acceptedOfferId: string }).acceptedOfferId.trim()
      : '';
  const off = acc ? getOfferById(acc) : null;
  const poster = req != null ? getRequestPosterId(req as Record<string, unknown>) : null;
  if (off != null && poster && poster.length > 0) {
    const rId = off.renterId.trim();
    if (m === poster) {
      return { userId: rId, displayName: getProfileNameForUserId(rId) };
    }
    if (m === rId) {
      return { userId: poster, displayName: getProfileNameForUserId(poster) };
    }
  }
  if (p0.userId === m) return participantWithResolvedName(p1);
  return participantWithResolvedName(p0);
}

/** Unread count for this user (incoming messages not yet opened in this chat). */
export function getUnreadCountForUser(chat: Chat, userId: string): number {
  const n = chat.unreadCountByUserId?.[userId];
  return typeof n === 'number' && n > 0 ? n : 0;
}

/** Mark current user's chat as read (call when opening the thread). */
export function markChatRead(chatId: string): void {
  ensureLoad();
  const me = getAuthUserIdSync();
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
    const aUser = a.messages.filter(isUserChatMessage);
    const bUser = b.messages.filter(isUserChatMessage);
    const ta = aUser.length ? aUser[aUser.length - 1].timestamp : a.createdAt;
    const tb = bUser.length ? bUser[bUser.length - 1].timestamp : b.createdAt;
    return tb - ta;
  });
}

export type CreateChatPayload = {
  id: string;
  requestId: number | null;
  participants: [{ userId: string }, { userId: string }];
};

function createChat(payload: CreateChatPayload): void {
  ensureLoad();
  const { id, requestId, participants } = payload;
  const trimmedId = id.trim();
  if (!trimmedId || chats.some((c) => c.id === trimmedId)) return;

  const p0 = participants[0];
  const p1 = participants[1];
  const a: ChatParticipant = {
    userId: p0.userId,
    displayName: displayNameForUserId(p0.userId),
  };
  const b: ChatParticipant = {
    userId: p1.userId,
    displayName: displayNameForUserId(p1.userId),
  };
  const ordered: [ChatParticipant, ChatParticipant] =
    p0.userId === p1.userId ? withDistinctParticipants(a, b) : sortParticipants(a, b);

  const now = Date.now();
  chats = [
    {
      id: trimmedId,
      requestId: requestId ?? 0,
      offerId: 'legacy',
      participants: ordered,
      messages: [],
      createdAt: now,
      archived: false,
      unreadCountByUserId: {},
    },
    ...chats,
  ];
  emit();
  void persist();
}

export type ChatStoreState = {
  chats: Chat[];
  createChat: (payload: CreateChatPayload) => void;
};

function getChatStoreState(): ChatStoreState {
  return { chats: listChatsSortedByLatest(), createChat };
}

function useChatStoreImpl(): ChatStoreState;
function useChatStoreImpl<T>(selector: (state: ChatStoreState) => T): T;
function useChatStoreImpl<T>(
  selector?: (state: ChatStoreState) => T
): ChatStoreState | T {
  const sel =
    selector ?? ((state: ChatStoreState) => state as unknown as T);
  const selectorRef = useRef(sel);
  selectorRef.current = sel;
  const v = useSyncExternalStore(subscribeChats, getVersion, getVersion);
  return useMemo(() => selectorRef.current!(getChatStoreState()), [v]);
}

/**
 * Subscribe to chat store; selector runs on each store update (new messages, etc.).
 * Example: `const chats = useChatStore((s) => s.chats);`
 * `useChatStore()` (no selector) returns the full snapshot, same as `useChatStore((s) => s)`.
 */
export const useChatStore = Object.assign(useChatStoreImpl, {
  getState: getChatStoreState,
});

export function useChats(): Chat[] {
  return useChatStore((state) => state.chats);
}

/** Sum of unread incoming messages for the current user across all chats; updates when chats change. */
export function useTotalUnreadChatCount(): number {
  const me = useAuthUserId();
  const chats = useChats();
  return useMemo(
    () => chats.reduce((sum, chat) => sum + getUnreadCountForUser(chat, me), 0),
    [chats, me]
  );
}
