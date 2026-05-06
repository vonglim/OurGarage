import { Pressable } from '@/components/Pressable';
import { ScreenBackButton } from '@/components/ScreenBackButton';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from '@/components/KeyboardDismissScreen';
import { RentalDetailsCard, type RentalMeetupDetails } from '@/components/RentalDetailsCard';
import { subtleControlPressed, ui } from '@/constants/appUi';
import { useAuthUserId } from '@/lib/authUser';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { showFeedbackToast } from '@/store/feedbackToastStore';

type OfferMessageRow = {
  id: string;
  author_id: string;
  body: string | null;
  kind: string | null;
  created_at: string;
  offer_images?: string[] | null;
};

type ChatMessage = {
  id: string;
  senderId: string;
  text: string;
  timestamp: number;
  offer_images?: string[];
};

function normalizeChatRouteId(raw: string | string[] | undefined): string {
  if (raw == null) return '';
  if (Array.isArray(raw)) return String(raw[0] ?? '').trim();
  return String(raw).trim();
}

const NEAR_BOTTOM_PX = 160;
const TOUCH_DEBUG = true;

const OFFER_MESSAGES_SELECT = 'id, author_id, body, created_at, offer_images';

function normalizeImages(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
  }
  if (typeof val === 'string') {
    try {
      const parsed: unknown = JSON.parse(val);
      if (Array.isArray(parsed)) {
        return parsed.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
      }
    } catch {
      return [];
    }
  }
  return [];
}

function chatLogPrefix(routeId: string, rentalId: string | null): '[REQUEST CHAT]' | '[RENTAL CHAT]' {
  return rentalId != null && routeId === rentalId ? '[RENTAL CHAT]' : '[REQUEST CHAT]';
}

function mapOfferMessageRows(
  rows: OfferMessageRow[],
  logPrefix: '[REQUEST CHAT]' | '[RENTAL CHAT]'
): ChatMessage[] {
  return rows
    .filter((r) => {
      const imgs = normalizeImages(r.offer_images);
      return (r.body ?? '').trim() !== '' || imgs.length > 0;
    })
    .map((r) => {
      const offer_images = normalizeImages(r.offer_images);
      console.log(logPrefix, r.offer_images);
      const mapped: ChatMessage = {
        id: r.id,
        senderId: r.author_id,
        text: String(r.body ?? '').trim(),
        timestamp: Date.parse(r.created_at) || Date.now(),
        offer_images,
      };
      console.log(logPrefix, 'mapped ChatMessage', mapped);
      return mapped;
    });
}

export default function ChatDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id: idParam } = useLocalSearchParams<{ id?: string | string[] }>();
  const id = useMemo(() => normalizeChatRouteId(idParam), [idParam]);
  const meId = useAuthUserId();

  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadReady, setThreadReady] = useState(false);
  const [threadOfferId, setThreadOfferId] = useState('');
  const [threadRentalId, setThreadRentalId] = useState<string | null>(null);
  const [rental, setRental] = useState<RentalMeetupDetails | null>(null);
  const [rentalBusy, setRentalBusy] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const threadRef = useRef({ routeId: '', offerId: '', rentalId: null as string | null });
  const nearBottomRef = useRef(true);

  const scrollToEnd = useCallback((opts?: { animated?: boolean; force?: boolean }) => {
    const animated = opts?.animated ?? true;
    const force = opts?.force ?? false;
    if (!force && !nearBottomRef.current) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }, []);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const distFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    nearBottomRef.current = distFromBottom <= NEAR_BOTTOM_PX;
    if (TOUCH_DEBUG) {
      console.log('[TOUCH DEBUG] FlatList onScroll y=', contentOffset.y);
    }
  }, []);

  useEffect(() => {
    scrollToEnd({ animated: true, force: false });
  }, [messages.length, scrollToEnd]);

  const loadMessages = useCallback(
    async (routeId: string, offerId: string, rentalId: string | null) => {
      if (!isSupabaseConfigured()) {
        setMessages([]);
        return;
      }
      if (!routeId) {
        console.log('Missing chat id');
        setMessages([]);
        return;
      }
      if (!offerId) {
        setMessages([]);
        return;
      }
      const supabase = getSupabase();
      let q = supabase
        .from('offer_messages')
        .select(OFFER_MESSAGES_SELECT)
        .order('created_at', { ascending: true });
      // Keep Requests and Rentals on the exact same pipeline: offer_id thread query.
      q = q.eq('offer_id', offerId);
      const { data, error } = await q;
      if (error) {
        console.error('CHAT FETCH ERROR', error);
        setMessages([]);
        return;
      }
      const rows = (data ?? []) as OfferMessageRow[];
      const logPrefix = chatLogPrefix(routeId, rentalId);
      console.log(logPrefix, 'fetched', rows.length, 'rows');
      rows.forEach((row) => console.log(logPrefix, row.offer_images));
      setMessages(mapOfferMessageRows(rows, logPrefix));
    },
    []
  );

  useEffect(() => {
    console.log('CHAT ID:', id);
    if (!id) {
      console.log('Missing chat id');
      setThreadOfferId('');
      setThreadRentalId(null);
      setRental(null);
      setMessages([]);
      setThreadReady(true);
      return;
    }
    if (!isSupabaseConfigured()) {
      setThreadReady(true);
      return;
    }

    let cancelled = false;
    setThreadReady(false);

    const run = async () => {
      const supabase = getSupabase();
      const { data: byPk } = await supabase.from('rentals').select('*').eq('id', id).maybeSingle();
      let rentalRow = byPk;
      if (!rentalRow) {
        const { data: byOffer } = await supabase
          .from('rentals')
          .select('*')
          .eq('offer_id', id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        rentalRow = byOffer;
      }

      const r = (rentalRow as RentalMeetupDetails | null) ?? null;
      const oid = r?.offer_id ? String(r.offer_id).trim() : id;
      const rid = r?.id ? String(r.id).trim() : null;

      if (cancelled) return;
      setRental(r);
      setThreadOfferId(oid);
      setThreadRentalId(rid);

      await loadMessages(id, oid, rid);
      if (cancelled) return;
      setThreadReady(true);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [id, loadMessages]);

  useEffect(() => {
    threadRef.current = { routeId: id, offerId: threadOfferId, rentalId: threadRentalId };
  }, [id, threadOfferId, threadRentalId]);

  useEffect(() => {
    if (!threadOfferId || !isSupabaseConfigured()) return;
    const supabase = getSupabase();
    const offerFilter = `offer_id=eq.${threadOfferId}`;

    const reloadThreadMessages = () => {
      const t = threadRef.current;
      void loadMessages(t.routeId, t.offerId, t.rentalId);
    };

    const channel = supabase
      .channel(`chat-thread-${threadOfferId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'offer_messages',
          filter: offerFilter,
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          console.log(payload.new);
          const row = payload.new;
          if (!row || typeof row !== 'object') return;
          const t = threadRef.current;
          const logPrefix = chatLogPrefix(t.routeId, t.rentalId);
          const idStr = String((row as { id?: unknown }).id ?? '');
          if (!idStr) return;
          const authorId = String((row as { author_id?: unknown }).author_id ?? '');
          const bodyRaw = (row as { body?: unknown }).body;
          const text = bodyRaw != null ? String(bodyRaw) : '';
          const createdAt = String((row as { created_at?: unknown }).created_at ?? '');
          const rawImg = (row as { offer_images?: unknown }).offer_images;
          const offer_images = normalizeImages(rawImg);
          console.log(logPrefix, (row as { offer_images?: unknown }).offer_images);
          if (!text.trim() && offer_images.length === 0) {
            reloadThreadMessages();
            return;
          }
          const msg: ChatMessage = {
            id: idStr,
            senderId: authorId,
            text: text.trim(),
            timestamp: Date.parse(createdAt) || Date.now(),
            offer_images,
          };
          console.log(logPrefix, 'mapped ChatMessage', msg);
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'offer_messages',
          filter: offerFilter,
        },
        () => {
          reloadThreadMessages();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'offer_messages',
          filter: offerFilter,
        },
        () => {
          reloadThreadMessages();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rentals',
          filter: offerFilter,
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          if (payload.eventType === 'DELETE') {
            setRental(null);
            setThreadRentalId(null);
            return;
          }
          const row = payload.new;
          if (row && typeof row === 'object' && typeof row.id === 'string') {
            setRental(row as unknown as RentalMeetupDetails);
            setThreadRentalId(String(row.id));
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [threadOfferId, loadMessages]);

  const onSend = async () => {
    const text = draft.trim();
    if (!text || !threadOfferId || !meId) return;
    setDraft('');
    const receiverId =
      rental == null ? null : rental.owner_user_id === meId ? rental.renter_user_id : rental.owner_user_id;
    const insertRow: Record<string, unknown> = {
      offer_id: threadOfferId,
      author_id: meId,
      receiver_id: receiverId,
      body: text,
      price: null,
      kind: 'user_chat',
    };
    if (threadRentalId) insertRow.rental_id = threadRentalId;
    const { error } = await getSupabase().from('offer_messages').insert(insertRow);
    if (error) {
      console.error('SEND ERROR', error);
      showFeedbackToast('Could not send');
      return;
    }
    nearBottomRef.current = true;
    scrollToEnd({ animated: true, force: true });
    showFeedbackToast('Sent');
  };

  const insertMeetupSystemMessage = useCallback(
    async (input: {
      meetupLocation: string;
      meetupTimeIso: string;
      returnTimeIso: string;
    }) => {
      if (!rental || !meId) return;
      const pickupLine = new Date(input.meetupTimeIso).toLocaleString();
      const returnLine = new Date(input.returnTimeIso).toLocaleString();
      const body = `Rental details updated:\n📅 Pickup: ${pickupLine}\n🔁 Return: ${returnLine}\n📍 ${input.meetupLocation}`;
      const insertRow: Record<string, unknown> = {
        offer_id: rental.offer_id,
        author_id: meId,
        receiver_id: null,
        body,
        price: null,
        kind: 'system',
      };
      if (rental.id) insertRow.rental_id = rental.id;
      await getSupabase().from('offer_messages').insert(insertRow);
    },
    [rental, meId]
  );

  const onConfirmRentalDetails = useCallback(async () => {
    if (!rental || !meId) return;
    const sharedLoc = (rental.meetup_location || rental.return_location || '').trim();
    if (!rental.meetup_time || sharedLoc === '') {
      showFeedbackToast('Set pickup time and meetup location first.');
      return;
    }
    if (!rental.return_time) {
      showFeedbackToast('Set return time first.');
      return;
    }
    setRentalBusy(true);
    try {
      const patch: Record<string, unknown> = {};
      if (rental.renter_user_id === meId) patch.confirmed_by_renter = true;
      if (rental.owner_user_id === meId) patch.confirmed_by_owner = true;
      const { data, error } = await getSupabase()
        .from('rentals')
        .update(patch)
        .eq('id', rental.id)
        .select('*')
        .single();
      if (!error && data) setRental(data as RentalMeetupDetails);
    } finally {
      setRentalBusy(false);
    }
  }, [rental, meId]);

  const onProposeRentalDetails = useCallback(
    async (input: {
      meetupTimeIso: string;
      meetupLocation: string;
      returnTimeIso: string;
    }) => {
      if (!rental) return;
      setRentalBusy(true);
      try {
        const supabase = getSupabase();
        const { error } = await supabase
          .from('rentals')
          .update({
            meetup_time: input.meetupTimeIso,
            meetup_location: input.meetupLocation,
            return_time: input.returnTimeIso,
            return_location: input.meetupLocation,
            confirmed_by_renter: false,
            confirmed_by_owner: false,
          })
          .eq('id', rental.id);
        if (error) {
          showFeedbackToast('Could not update rental details.');
          return;
        }
        const { data } = await supabase.from('rentals').select('*').eq('id', rental.id).single();
        if (data) setRental(data as RentalMeetupDetails);
        await insertMeetupSystemMessage(input);
      } finally {
        setRentalBusy(false);
      }
    },
    [rental, insertMeetupSystemMessage]
  );

  if (!id) {
    return (
      <View
        style={[
          styles.screen,
          TOUCH_DEBUG ? { backgroundColor: 'rgba(0,128,255,0.08)' } : null,
        ]}
      >
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
      </View>
    );
  }

  return (
    <View
      style={[
        styles.screen,
        TOUCH_DEBUG ? { backgroundColor: 'rgba(0,128,255,0.08)' } : null,
      ]}
      onTouchStart={() => {
        if (TOUCH_DEBUG) console.log('[TOUCH DEBUG] Chat root View touch start');
      }}
    >
      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        onTouchStart={() => {
          if (TOUCH_DEBUG) console.log('[TOUCH DEBUG] KeyboardAvoidingView touch start');
        }}
      >
        <ScreenEntrance style={styles.entranceFlex}>
          <View style={styles.chatMain}>
            <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
              <View style={styles.headerBackSlot}>
                <ScreenBackButton onPress={() => router.back()} />
              </View>
              <View style={styles.headerTitleBlock}>
                <Text style={styles.title} numberOfLines={1}>
                  Chat
                </Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  {threadOfferId ? `Offer ${threadOfferId.slice(0, 8)}` : 'Chat'}
                </Text>
              </View>
              <View style={styles.headerSpacer} />
            </View>

            <View
              style={styles.chatBody}
              onTouchStart={() => {
                if (TOUCH_DEBUG) console.log('[TOUCH DEBUG] chatBody touch start');
              }}
            >
              {rental ? (
                <View
                  style={[
                    styles.rentalCardSlot,
                    TOUCH_DEBUG ? { backgroundColor: 'rgba(255,165,0,0.15)' } : null,
                  ]}
                  pointerEvents="box-none"
                  onTouchStart={() => {
                    if (TOUCH_DEBUG) console.log('[TOUCH DEBUG] rentalCardSlot touch start');
                  }}
                >
                  <RentalDetailsCard
                    rental={rental}
                    itemName="Rental"
                    durationLabel={(rental as { duration_type?: string }).duration_type ?? '—'}
                    isRenter={rental.renter_user_id === meId}
                    isOwner={rental.owner_user_id === meId}
                    busy={rentalBusy}
                    onConfirm={onConfirmRentalDetails}
                    onProposeChange={onProposeRentalDetails}
                  />
                </View>
              ) : null}

              <View
                style={[
                  styles.messagesArea,
                  TOUCH_DEBUG ? { backgroundColor: 'rgba(0,255,0,0.08)' } : null,
                ]}
                onTouchStart={() => {
                  if (TOUCH_DEBUG) console.log('[TOUCH DEBUG] messagesArea touch start');
                }}
              >
                <FlatList
                  ref={listRef}
                  style={[
                    styles.messagesList,
                    TOUCH_DEBUG ? { backgroundColor: 'rgba(255,0,255,0.08)' } : null,
                  ]}
                  data={messages}
                  keyExtractor={(item) => item.id}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="interactive"
                  onScroll={onScroll}
                  scrollEventThrottle={16}
                  onContentSizeChange={() => {
                    scrollToEnd({ animated: true, force: false });
                  }}
                  contentContainerStyle={[
                    styles.messagesContent,
                    rental ? styles.messagesContentBelowCard : null,
                    messages.length === 0 ? styles.messagesContentEmpty : null,
                    { paddingBottom: 12 + insets.bottom },
                  ]}
                  ListEmptyComponent={<Text style={styles.hint}>No messages yet</Text>}
                  renderItem={({ item: message, index }) => {
                    const hasText = typeof message.text === 'string' && message.text.trim() !== '';
                    const hasImages = Array.isArray(message.offer_images) && message.offer_images.length > 0;
                    if (!hasText && !hasImages) return null;
                    const isCurrentUser = message.senderId === meId;
                    const prev = index > 0 ? messages[index - 1] : null;
                    const senderChanged = prev != null && prev.senderId !== message.senderId;
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
                          <View style={[styles.messageBubble, isCurrentUser ? styles.right : styles.left]}>
                            <Text style={isCurrentUser ? styles.rightText : styles.leftText}>{message.text}</Text>
                            {hasImages ? (
                              <View style={{ marginTop: 8 }}>
                                {(message.offer_images ?? []).map((img, i) => (
                                  <Image
                                    key={i}
                                    source={{ uri: String(img) }}
                                    style={{ width: 160, height: 160, borderRadius: 10, marginTop: 6 }}
                                    resizeMode="cover"
                                  />
                                ))}
                              </View>
                            ) : null}
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
              </View>

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
            </View>
          </View>
        </ScreenEntrance>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    minHeight: 0,
    backgroundColor: ui.surfaceGrouped,
  },
  entranceFlex: {
    flex: 1,
    minHeight: 0,
    width: '100%',
  },
  chatMain: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    flexDirection: 'column',
  },
  chatBody: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    flexDirection: 'column',
  },
  rentalCardSlot: {
    flexShrink: 0,
  },
  messagesArea: {
    flex: 1,
    minHeight: 0,
    width: '100%',
  },
  messagesList: {
    flex: 1,
  },
  keyboardAvoiding: {
    flex: 1,
    minHeight: 0,
    width: '100%',
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
  messagesContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  messagesContentBelowCard: {
    paddingTop: 20,
  },
  messagesContentEmpty: {
    flexGrow: 1,
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
    flexShrink: 0,
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
