import { Pressable } from '@/components/Pressable';
import { ScreenBackButton } from '@/components/ScreenBackButton';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from '@/components/KeyboardDismissScreen';
import {
  RentalDetailsCard,
  type RentalMeetupDetails,
} from '@/components/RentalDetailsCard';
import { subtleControlPressed, ui } from '@/constants/appUi';
import { setActiveChatOfferThreadId } from '@/lib/activeChatOfferThread';
import { useAuthUserId } from '@/lib/authUser';
import { insertServerNotificationToRecipient } from '@/lib/insertServerNotification';
import { markMessageNotificationsForOfferAsRead, markOfferThreadRead } from '@/lib/messageUnread';
import {
  OFFER_MEETUP_PROPOSAL_KIND,
  insertMeetupProposalOfferMessage,
} from '@/lib/meetupProposalThreadEvent';
import { RENTAL_CANCELLATION_SYSTEM_MESSAGE_KIND } from '@/lib/rentalCancellation/rentalCancellationChat';
import {
  acceptRentalMeetupProposal,
  declineRentalMeetupProposal,
} from '@/lib/rentalMeetupProposalLifecycle';
import { getProfileNameForUserId } from '@/lib/profileDisplayName';
import { resolveAgreementBaselineDurationHours } from '@/lib/proposalDurationChange';
import { evaluateMeetupProposalDurationWarning } from '@/lib/rentalDurationValidation';
import { isUuidString } from '@/lib/requestOwnership';
import { sendOfferThreadUserMessage } from '@/lib/sendOfferThreadMessage';
import { decodeDescriptionExtras } from '@/lib/supabaseRequests';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { showFeedbackToast } from '@/store/feedbackToastStore';
import { useMessageUnreadStore } from '@/store/messageUnreadStore';
import { useFocusEffect } from '@react-navigation/native';

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
  kind?: string | null;
  offer_images?: string[];
};

function normalizeChatRouteId(raw: string | string[] | undefined): string {
  if (raw == null) return '';
  if (Array.isArray(raw)) return String(raw[0] ?? '').trim();
  return String(raw).trim();
}

const NEAR_BOTTOM_PX = 160;
const TOUCH_DEBUG = false;

const OFFER_MESSAGES_SELECT = 'id, author_id, body, kind, created_at, offer_images';
const HEADER_SURFACE = '#F7F8FB';

function rentalPickupIso(rental: RentalMeetupDetails | null): string | null {
  if (!rental) return null;
  return rental.pickup_datetime ?? rental.meetup_time ?? null;
}

function rentalReturnIso(rental: RentalMeetupDetails | null): string | null {
  if (!rental) return null;
  return rental.return_datetime ?? rental.return_time ?? null;
}

function rentalSharedLocation(rental: RentalMeetupDetails | null): string {
  if (!rental) return '';
  return (rental.meetup_location || rental.return_location || '').trim();
}

function ownerConfirmed(rental: RentalMeetupDetails | null): boolean {
  if (!rental) return false;
  if (typeof rental.owner_confirmed === 'boolean') return rental.owner_confirmed;
  return Boolean(rental.confirmed_by_owner);
}

function renterConfirmed(rental: RentalMeetupDetails | null): boolean {
  if (!rental) return false;
  if (typeof rental.renter_confirmed === 'boolean') return rental.renter_confirmed;
  return Boolean(rental.confirmed_by_renter);
}

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

function parseMeetupProposalLines(text: string): {
  pickup: string;
  returnAt: string;
  location: string;
  durationWarning: string;
  isExtension: boolean;
} | null {
  const t = text.trim();
  if (!t) return null;
  const isExtension = /^Extension requested/i.test(t);
  const lines = t.split('\n').map((l) => l.trim());
  const pickup =
    lines
      .find((line) => /^Pickup time proposed:/i.test(line) || /^Pickup \(unchanged\):/i.test(line))
      ?.replace(/^Pickup time proposed:\s*/i, '')
      .replace(/^Pickup \(unchanged\):\s*/i, '')
      .trim() ?? '';
  const returnAt =
    lines
      .find((line) => /^Return time proposed:/i.test(line))
      ?.replace(/^Return time proposed:\s*/i, '')
      .trim() ?? '';
  const locLine = lines.find((line) => line.startsWith('📍'));
  const location = locLine?.replace(/^📍\s*/, '').trim() ?? '';
  const durationWarning =
    lines
      .find((line) => /^⚠\s*Duration changed/i.test(line))
      ?.replace(/^⚠\s*/i, '')
      .trim() ?? '';
  if (!pickup && !returnAt && !location && !durationWarning && !isExtension) return null;
  return { pickup, returnAt, location, durationWarning, isExtension };
}

function parseRentalUpdateMessage(text: string): {
  pickup: string;
  returnAt: string;
  location: string;
  durationWarning: string;
  isExtension: boolean;
} | null {
  if (!text.startsWith('Rental details updated:')) return null;
  const lines = text.split('\n');
  const pickup = lines.find((line) => line.startsWith('📅 Pickup:'))?.replace('📅 Pickup:', '').trim() ?? '';
  const returnAt = lines.find((line) => line.startsWith('🔁 Return:'))?.replace('🔁 Return:', '').trim() ?? '';
  const location = lines.find((line) => line.startsWith('📍'))?.replace('📍', '').trim() ?? '';
  if (!pickup && !returnAt && !location) return null;
  return { pickup, returnAt, location, durationWarning: '', isExtension: false };
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
        kind: r.kind ?? null,
        offer_images,
      };
      console.log(logPrefix, 'mapped ChatMessage', mapped);
      return mapped;
    });
}

export default function ChatDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { id: idParam } = useLocalSearchParams<{ id?: string | string[] }>();
  const id = useMemo(() => normalizeChatRouteId(idParam), [idParam]);
  const meId = useAuthUserId();
  const bubbleMaxWidth = useMemo(() => Math.min(Math.max(screenWidth * 0.76, 240), 520), [screenWidth]);

  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadReady, setThreadReady] = useState(false);
  const [threadOfferId, setThreadOfferId] = useState('');
  const [threadRentalId, setThreadRentalId] = useState<string | null>(null);
  const [rental, setRental] = useState<RentalMeetupDetails | null>(null);
  const [rentalTitle, setRentalTitle] = useState<string>('');
  const [requestSchedulingMeta, setRequestSchedulingMeta] = useState<Record<string, unknown> | null>(null);
  const [rentalBusy, setRentalBusy] = useState(false);
  const [acceptingMessageId, setAcceptingMessageId] = useState<string | null>(null);
  const [acceptedMessageIds, setAcceptedMessageIds] = useState<string[]>([]);
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
      setRequestSchedulingMeta(null);
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
      setRentalTitle('');
      setRequestSchedulingMeta(null);
      setThreadOfferId(oid);
      setThreadRentalId(rid);

      if (r?.request_id) {
        const { data: requestRow } = await supabase
          .from('requests')
          .select('title, description, duration_type, duration_value')
          .eq('id', r.request_id)
          .maybeSingle();
        if (!cancelled) {
          setRentalTitle(typeof requestRow?.title === 'string' ? requestRow.title.trim() : '');
          const decoded = decodeDescriptionExtras(
            typeof requestRow?.description === 'string' ? requestRow.description : null
          );
          const dbRow = requestRow as Record<string, unknown> | undefined;
          setRequestSchedulingMeta({
            ...decoded,
            duration_type: dbRow?.duration_type ?? decoded.durationType,
            duration_value: dbRow?.duration_value ?? decoded.durationValue,
            when: decoded.when,
          });
        }
      } else if (!cancelled) {
        setRequestSchedulingMeta(null);
      }

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

  const agreementBaselineDurationHours = useMemo(
    () => resolveAgreementBaselineDurationHours(rental, requestSchedulingMeta),
    [rental, requestSchedulingMeta]
  );

  useFocusEffect(
    React.useCallback(() => {
      const oid = threadOfferId.trim();
      if (oid) setActiveChatOfferThreadId(oid);
      else setActiveChatOfferThreadId(null);
      return () => setActiveChatOfferThreadId(null);
    }, [threadOfferId])
  );

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
            kind: String((row as { kind?: unknown }).kind ?? ''),
            offer_images,
          };
          console.log(logPrefix, 'mapped ChatMessage', msg);
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          if (meId && authorId && authorId !== meId) {
            void (async () => {
              if (__DEV__) {
                console.log('[messageUnread] incoming message mark-read sequence start', {
                  threadOfferId,
                  meId,
                  authorId,
                });
              }
              if (__DEV__) {
                console.log('[messageUnread] calling markOfferThreadRead (incoming message)', {
                  threadOfferId,
                });
              }
              await markOfferThreadRead(threadOfferId);
              if (__DEV__) {
                console.log('[messageUnread] completed markOfferThreadRead (incoming message)', {
                  threadOfferId,
                });
                console.log('[messageUnread] calling markMessageNotificationsForOfferAsRead (incoming message)', {
                  threadOfferId,
                });
              }
              await markMessageNotificationsForOfferAsRead(threadOfferId);
              if (__DEV__) {
                console.log('[messageUnread] completed markMessageNotificationsForOfferAsRead (incoming message)', {
                  threadOfferId,
                });
                console.log('[messageUnread] post-mark refresh (incoming message)', {
                  offerId: threadOfferId,
                });
              }
              await useMessageUnreadStore.getState().refresh();
            })();
          }
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
  }, [threadOfferId, loadMessages, meId]);

  useEffect(() => {
    if (!threadOfferId || !meId) {
      if (__DEV__) {
        console.warn('[messageUnread] thread-open effect early exit', {
          threadOfferId,
          meId,
          reason: !threadOfferId ? 'missing_thread_offer_id' : 'missing_me_id',
        });
      }
      return;
    }
    void (async () => {
      if (__DEV__) {
        console.log('[messageUnread] thread-open mark-read sequence start', {
          threadOfferId,
          meId,
        });
        console.log('[messageUnread] calling markOfferThreadRead (thread open)', {
          threadOfferId,
        });
      }
      await markOfferThreadRead(threadOfferId);
      if (__DEV__) {
        console.log('[messageUnread] completed markOfferThreadRead (thread open)', {
          threadOfferId,
        });
        console.log('[messageUnread] calling markMessageNotificationsForOfferAsRead (thread open)', {
          threadOfferId,
        });
      }
      await markMessageNotificationsForOfferAsRead(threadOfferId);
      if (__DEV__) {
        console.log('[messageUnread] completed markMessageNotificationsForOfferAsRead (thread open)', {
          threadOfferId,
        });
        console.log('[messageUnread] post-mark refresh (thread open)', {
          offerId: threadOfferId,
        });
      }
      await useMessageUnreadStore.getState().refresh();
    })();
  }, [threadOfferId, meId]);

  const onSend = async () => {
    const text = draft.trim();
    if (!text || !threadOfferId || !meId) return;
    setDraft('');
    const receiverId =
      rental == null ? null : rental.owner_user_id === meId ? rental.renter_user_id : rental.owner_user_id;
    if (!receiverId) {
      showFeedbackToast('Could not resolve recipient');
      return;
    }
    const { error } = await sendOfferThreadUserMessage({
      offerId: threadOfferId,
      requestRowId: rental?.request_id ?? null,
      rentalId: threadRentalId,
      authorId: meId,
      receiverId,
      body: text,
    });
    if (error) {
      console.error('SEND ERROR', error);
      showFeedbackToast('Could not send');
      return;
    }
    nearBottomRef.current = true;
    scrollToEnd({ animated: true, force: true });
    showFeedbackToast('Sent');
  };

  const onAcceptRentalSystemMessage = useCallback(
    async (message: ChatMessage) => {
      if (!rental || !meId) return;
      if (message.senderId === meId) return;

      const patch: Record<string, unknown> = {
        confirmed_by_owner: true,
        confirmed_by_renter: true,
        owner_confirmed: true,
        renter_confirmed: true,
        agreement_status: 'confirmed',
        confirmed_at: new Date().toISOString(),
      };
      if (__DEV__) {
        console.log('[proposal-confirm] accept press', {
          routeId: id,
          threadOfferId,
          threadRentalId,
          rentalId: rental.id,
          requestId: rental.request_id,
          offerId: rental.offer_id,
          meId,
          messageId: message.id,
          patch,
        });
      }

      setAcceptingMessageId(message.id);
      try {
        const itemTitle =
          typeof requestSchedulingMeta === 'object' &&
          requestSchedulingMeta != null &&
          typeof (requestSchedulingMeta as { title?: string }).title === 'string'
            ? (requestSchedulingMeta as { title: string }).title
            : null;
        const result = await acceptRentalMeetupProposal(getSupabase(), rental, meId, { itemTitle });
        if (!result.ok) {
          if (__DEV__) {
            console.warn('[proposal-confirm] accept failed', {
              rentalId: rental.id,
              message: result.message,
            });
          }
          showFeedbackToast('Could not confirm yet.');
          return;
        }
        const { data } = await getSupabase().from('rentals').select('*').eq('id', rental.id).single();
        if (data) setRental(data as RentalMeetupDetails);
        setAcceptedMessageIds((prev) => (prev.includes(message.id) ? prev : [...prev, message.id]));
      } finally {
        setAcceptingMessageId(null);
      }
    },
    [rental, meId, id, threadOfferId, threadRentalId, requestSchedulingMeta]
  );

  const onDeclineRentalSystemMessage = useCallback(
    async (message: ChatMessage) => {
      if (!rental || !meId) return;
      if (message.senderId === meId) return;
      const proceed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'Decline extension?',
          'The original return window stays in effect.',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Decline', style: 'destructive', onPress: () => resolve(true) },
          ]
        );
      });
      if (!proceed) return;
      setAcceptingMessageId(message.id);
      try {
        const result = await declineRentalMeetupProposal(getSupabase(), rental, meId);
        if (!result.ok) {
          showFeedbackToast('Could not decline.');
          return;
        }
        const { data } = await getSupabase().from('rentals').select('*').eq('id', rental.id).single();
        if (data) setRental(data as RentalMeetupDetails);
      } finally {
        setAcceptingMessageId(null);
      }
    },
    [rental, meId]
  );

  const insertMeetupProposalMessage = useCallback(
    async (input: {
      meetupLocation: string;
      meetupTimeIso: string;
      returnTimeIso: string;
      durationWarningLine?: string | null;
    }) => {
      if (!rental || !meId) return null;
      const offerId = String(rental.offer_id ?? '').trim();
      const receiverId =
        rental.owner_user_id === meId
          ? String(rental.renter_user_id ?? '').trim()
          : String(rental.owner_user_id ?? '').trim();
      if (!offerId || !receiverId || receiverId === meId) return null;
      const requestRowId =
        rental.request_id != null && isUuidString(String(rental.request_id))
          ? String(rental.request_id)
          : null;
      return insertMeetupProposalOfferMessage({
        offerId,
        requestRowId,
        rentalId: rental.id,
        authorId: meId,
        receiverId,
        meetupTimeIso: input.meetupTimeIso,
        returnTimeIso: input.returnTimeIso,
        meetupLocation: input.meetupLocation,
        durationWarningLine: input.durationWarningLine,
      });
    },
    [rental, meId]
  );

  const onConfirmRentalDetails = useCallback(async () => {
    if (!rental || !meId) return;
    const sharedLoc = rentalSharedLocation(rental);
    if (!rentalPickupIso(rental) || sharedLoc === '') {
      showFeedbackToast('Set pickup time and meetup location first.');
      return;
    }
    if (!rentalReturnIso(rental)) {
      showFeedbackToast('Set return time first.');
      return;
    }
    setRentalBusy(true);
    try {
      const patch: Record<string, unknown> = {};
      if (rental.renter_user_id === meId) {
        patch.confirmed_by_renter = true;
        patch.renter_confirmed = true;
      }
      if (rental.owner_user_id === meId) {
        patch.confirmed_by_owner = true;
        patch.owner_confirmed = true;
      }
      const nextOwnerConfirmed = patch.owner_confirmed ?? ownerConfirmed(rental);
      const nextRenterConfirmed = patch.renter_confirmed ?? renterConfirmed(rental);
      if (nextOwnerConfirmed && nextRenterConfirmed) {
        patch.agreement_status = 'confirmed';
        patch.confirmed_at = new Date().toISOString();
      } else {
        patch.agreement_status = 'pending';
        patch.confirmed_at = null;
      }
      if (__DEV__) {
        console.log('[proposal-confirm] footer confirm attempt', {
          routeId: id,
          threadOfferId,
          threadRentalId,
          rentalId: rental.id,
          requestId: rental.request_id,
          offerId: rental.offer_id,
          meId,
          patch,
        });
      }
      const { data, error } = await getSupabase()
        .from('rentals')
        .update(patch)
        .eq('id', rental.id)
        .select('*')
        .single();
      if (error && __DEV__) {
        console.warn('[proposal-confirm] footer confirm failed', {
          routeId: id,
          threadOfferId,
          threadRentalId,
          rentalId: rental.id,
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          patchKeys: Object.keys(patch),
        });
      }
      if (!error && data) setRental(data as RentalMeetupDetails);
    } finally {
      setRentalBusy(false);
    }
  }, [rental, meId, id, threadOfferId, threadRentalId]);

  const onProposeRentalDetails = useCallback(
    async (input: {
      meetupTimeIso: string;
      meetupLocation: string;
      returnTimeIso: string;
    }): Promise<boolean> => {
      if (__DEV__) {
        console.log('[proposal] onProposeRentalDetails called', {
          routeId: id,
          threadOfferId,
          threadRentalId,
          rentalId: rental?.id ?? null,
          requestId: rental?.request_id ?? null,
          offerId: rental?.offer_id ?? null,
          meId,
          input,
        });
      }
      if (!rental) return false;
      const durationEval = evaluateMeetupProposalDurationWarning({
        rental,
        requestSchedulingMeta,
        meetupTimeIso: input.meetupTimeIso,
        returnTimeIso: input.returnTimeIso,
      });
      if (durationEval.warningTriggered) {
        const continueProposal = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Duration change',
            [
              'You are proposing a rental duration different from the original agreement.',
              '',
              `Original duration: ${durationEval.originalLabel ?? '—'}`,
              `Proposed duration: ${durationEval.proposedLabel ?? '—'}`,
              '',
              'The other party must approve this change. Pricing and rental terms may change based on the updated duration.',
            ].join('\n'),
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Continue Proposal', onPress: () => resolve(true) },
            ]
          );
        });
        if (!continueProposal) return false;
      }
      setRentalBusy(true);
      try {
        const supabase = getSupabase();
        const iAmOwner = rental.owner_user_id === meId;
        const iAmRenter = rental.renter_user_id === meId;
        const nowIso = new Date().toISOString();
        const nextProposalVersion =
          typeof rental.proposal_version === 'number' && Number.isFinite(rental.proposal_version)
            ? rental.proposal_version + 1
            : 2;
        const hasCol = (k: string) => Object.prototype.hasOwnProperty.call(rental, k);
        const payload: Record<string, unknown> = {
          meetup_time: input.meetupTimeIso,
          meetup_location: input.meetupLocation,
          return_time: input.returnTimeIso,
          return_location: input.meetupLocation,
          confirmed_by_owner: iAmOwner ? true : false,
          confirmed_by_renter: iAmRenter ? true : false,
        };
        if (hasCol('pickup_datetime')) payload.pickup_datetime = input.meetupTimeIso;
        if (hasCol('return_datetime')) payload.return_datetime = input.returnTimeIso;
        if (hasCol('owner_confirmed')) payload.owner_confirmed = iAmOwner ? true : false;
        if (hasCol('renter_confirmed')) payload.renter_confirmed = iAmRenter ? true : false;
        if (hasCol('agreement_status')) payload.agreement_status = 'pending';
        if (hasCol('confirmed_at')) payload.confirmed_at = null;
        if (hasCol('last_proposed_by')) payload.last_proposed_by = meId;
        if (hasCol('proposal_version')) payload.proposal_version = nextProposalVersion;
        if (hasCol('proposal_updated_at')) payload.proposal_updated_at = nowIso;
        if (hasCol('latest_proposal_message_id')) payload.latest_proposal_message_id = null;
        if (__DEV__) {
          console.log('[proposal] rentals update payload keys', {
            rentalId: rental.id,
            keys: Object.keys(payload),
          });
        }
        const { error } = await supabase.from('rentals').update(payload).eq('id', rental.id);
        if (error) {
          if (__DEV__) {
            console.warn('[proposal] rentals update failed', {
              rentalId: rental.id,
              error: error.message,
              code: error.code,
            });
          }
          showFeedbackToast('Could not update rental details.');
          return false;
        }
        const messageId = await insertMeetupProposalMessage({
          ...input,
          durationWarningLine: durationEval.warningLine,
        });
        if (__DEV__) {
          console.log('[proposal] insertMeetupProposalMessage result', {
            rentalId: rental.id,
            messageId,
          });
        }
        if (!messageId) {
          showFeedbackToast('Could not post proposal to chat.');
          return false;
        }
        const receiverId =
          rental.owner_user_id === meId
            ? String(rental.renter_user_id ?? '').trim()
            : String(rental.owner_user_id ?? '').trim();
        if (receiverId && receiverId !== meId && isUuidString(receiverId)) {
          const reqUuid =
            rental.request_id != null && isUuidString(String(rental.request_id))
              ? String(rental.request_id)
              : null;
          const offerUuid =
            rental.offer_id != null && isUuidString(String(rental.offer_id))
              ? String(rental.offer_id)
              : null;
          insertServerNotificationToRecipient({
            actorId: meId,
            recipientUserId: receiverId,
            type: 'message',
            title: durationEval.warningTriggered
              ? `${getProfileNameForUserId(meId)} proposed updated meetup times with a changed rental duration`
              : `${getProfileNameForUserId(meId)} proposed a pickup time`,
            body: rentalTitle.trim()
              ? `New meetup proposal for ${rentalTitle.trim()}`
              : 'New meetup proposal',
            requestId: reqUuid,
            offerId: offerUuid,
            rentalId: rental.id,
          });
        }
        if (messageId && hasCol('latest_proposal_message_id')) {
          await supabase
            .from('rentals')
            .update({ latest_proposal_message_id: messageId })
            .eq('id', rental.id);
        }
        const { data } = await supabase.from('rentals').select('*').eq('id', rental.id).single();
        if (data) setRental(data as RentalMeetupDetails);
        if (__DEV__) {
          console.log('[proposal] onProposeRentalDetails success', {
            rentalId: rental.id,
            latestProposalMessageId: messageId ?? null,
          });
        }
        return true;
      } finally {
        setRentalBusy(false);
      }
    },
    [
      rental,
      meId,
      insertMeetupProposalMessage,
      id,
      threadOfferId,
      threadRentalId,
      rentalTitle,
      requestSchedulingMeta,
    ]
  );

  if (!id) {
    return (
      <View
        style={[
          styles.screen,
          TOUCH_DEBUG ? { backgroundColor: 'rgba(0,128,255,0.08)' } : null,
        ]}
      >
        <StatusBar style="dark" backgroundColor={HEADER_SURFACE} />
        <ScreenEntrance style={styles.entranceFlex}>
          <View style={[styles.topContext, { paddingTop: insets.top + 8 }]}>
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
      <StatusBar style="dark" backgroundColor={HEADER_SURFACE} />
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
            <View style={[styles.headerRegion, { paddingTop: insets.top + 2 }]}>
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
                    headerTitle={rentalTitle ? `Rental: ${rentalTitle}` : 'Rental'}
                    agreementBaselineDurationHours={agreementBaselineDurationHours}
                    headerLeftAccessory={
                      <ScreenBackButton
                        onPress={() => router.back()}
                        style={styles.integratedBackBtn}
                        iconSize={18}
                      />
                    }
                    showHeaderEditAction
                    itemName="Rental"
                    durationLabel={(rental as { duration_type?: string }).duration_type ?? '—'}
                    isRenter={rental.renter_user_id === meId}
                    isOwner={rental.owner_user_id === meId}
                    busy={rentalBusy}
                    onConfirm={onConfirmRentalDetails}
                    onProposeChange={onProposeRentalDetails}
                    onPrepareMeetup={() => {
                      if (rental.renter_user_id === meId) {
                        router.push(`/rental-wizard/${rental.id}`);
                      } else {
                        router.push({
                          pathname: '/rental/[id]',
                          params: { id: rental.id },
                        });
                      }
                    }}
                  />
                </View>
              ) : (
                <View style={styles.headerOnlyBackRow}>
                  <ScreenBackButton
                    onPress={() => router.back()}
                    style={styles.integratedBackBtn}
                    iconSize={18}
                  />
                </View>
              )}
            </View>

            <View
              style={styles.chatBody}
              onTouchStart={() => {
                if (TOUCH_DEBUG) console.log('[TOUCH DEBUG] chatBody touch start');
              }}
            >
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
                    { paddingHorizontal: 14 },
                    { paddingBottom: 12 + insets.bottom },
                  ]}
                  ListEmptyComponent={<Text style={styles.hint}>No messages yet</Text>}
                  renderItem={({ item: message, index }) => {
                      const hasText = typeof message.text === 'string' && message.text.trim() !== '';
                      const hasImages = Array.isArray(message.offer_images) && message.offer_images.length > 0;
                      if (!hasText && !hasImages) return null;
                      const isCurrentUser = message.senderId === meId;
                      const parsedProposal = parseMeetupProposalLines(message.text);
                      const parsedLegacy = parseRentalUpdateMessage(message.text);
                      const proposalDetails = parsedProposal ?? parsedLegacy;
                      const isMeetupProposal = message.kind === OFFER_MEETUP_PROPOSAL_KIND;
                      const proposerName = getProfileNameForUserId(message.senderId).trim() || 'Someone';
                      const isCancellationSystem =
                        message.kind === RENTAL_CANCELLATION_SYSTEM_MESSAGE_KIND;
                      const isRentalDetailsSystem =
                        message.kind === OFFER_MEETUP_PROPOSAL_KIND ||
                        message.kind === 'system_rental_details' ||
                        message.text.startsWith('Rental details updated:');
                    const iAmRenter = rental?.renter_user_id === meId;
                    const iAmOwner = rental?.owner_user_id === meId;
                    const myConfirmed = iAmRenter
                    ? renterConfirmed(rental)
                      : iAmOwner
                      ? ownerConfirmed(rental)
                        : true;
                    const canAcceptInChat =
                      Boolean(rental) && isRentalDetailsSystem && !isCurrentUser && !myConfirmed;
                    const showAcceptedState =
                      Boolean(rental) &&
                      isRentalDetailsSystem &&
                      !isCurrentUser &&
                      (myConfirmed || acceptedMessageIds.includes(message.id));
                      const prev = index > 0 ? messages[index - 1] : null;
                      const senderChanged = prev != null && prev.senderId !== message.senderId;
                      if (isCancellationSystem) {
                        return (
                          <View style={styles.cancellationSystemRow}>
                            <Text style={styles.cancellationSystemText}>{message.text}</Text>
                          </View>
                        );
                      }

                      return (
                        <View style={styles.messageRow}>
                          <View
                            style={[
                              styles.messageStack,
                              { maxWidth: bubbleMaxWidth },
                              isRentalDetailsSystem ? styles.messageStackSystem : null,
                              isCurrentUser ? styles.messageStackRight : styles.messageStackLeft,
                              index > 0 &&
                                (senderChanged ? styles.messageStackNewSender : styles.messageStackSameSender),
                            ]}
                          >
                            <View
                              style={[
                                styles.messageBubble,
                                isRentalDetailsSystem
                                  ? styles.systemBubble
                                  : isCurrentUser
                                    ? styles.right
                                    : styles.left,
                              ]}
                            >
                              {isRentalDetailsSystem ? (
                                <View style={styles.systemCardBody}>
                                  <Text style={styles.systemTitle}>
                                    {isMeetupProposal
                                      ? proposalDetails?.isExtension
                                        ? `${proposerName} requested an extension`
                                        : `${proposerName} proposed a meetup`
                                      : 'Rental updated'}
                                  </Text>
                                  {proposalDetails?.location ? (
                                    <Text style={styles.systemLine}>
                                      <Text style={styles.systemLineLabel}>Location: </Text>
                                      {proposalDetails.location}
                                    </Text>
                                  ) : null}
                                  {proposalDetails?.pickup ? (
                                    <Text style={styles.systemLine}>
                                      <Text style={styles.systemLineLabel}>Pickup: </Text>
                                      {proposalDetails.pickup}
                                    </Text>
                                  ) : null}
                                  {proposalDetails?.returnAt ? (
                                    <Text style={styles.systemLine}>
                                      <Text style={styles.systemLineLabel}>Return: </Text>
                                      {proposalDetails.returnAt}
                                    </Text>
                                  ) : null}
                                  {proposalDetails?.durationWarning ? (
                                    <Text style={styles.systemWarningLine}>⚠ {proposalDetails.durationWarning}</Text>
                                  ) : null}
                                  {!proposalDetails ? (
                                    <Text style={styles.systemFallbackText}>{message.text}</Text>
                                  ) : null}
                                </View>
                              ) : (
                                <Text style={isCurrentUser ? styles.rightText : styles.leftText}>{message.text}</Text>
                              )}
                              {hasImages ? (
                                <View style={styles.imageGroup}>
                                  {(message.offer_images ?? []).map((img, i) => (
                                    <Image
                                      key={i}
                                      source={{ uri: String(img) }}
                                      style={styles.messageImage}
                                      resizeMode="cover"
                                    />
                                  ))}
                                </View>
                              ) : null}
                              {canAcceptInChat ? (
                                <View style={styles.systemActionRow}>
                                  <Pressable
                                    pressOpacityFeedback={false}
                                    onPress={() => void onAcceptRentalSystemMessage(message)}
                                    disabled={acceptingMessageId === message.id}
                                    style={({ pressed }) => [
                                      styles.systemAcceptBtn,
                                      pressed && styles.systemAcceptBtnPressed,
                                    ]}
                                  >
                                    <Text style={styles.systemAcceptText}>
                                      {acceptingMessageId === message.id
                                        ? 'Saving…'
                                        : proposalDetails?.isExtension
                                          ? 'Approve'
                                          : 'Accept'}
                                    </Text>
                                  </Pressable>
                                  {proposalDetails?.isExtension ? (
                                    <Pressable
                                      pressOpacityFeedback={false}
                                      onPress={() => void onDeclineRentalSystemMessage(message)}
                                      disabled={acceptingMessageId === message.id}
                                      style={({ pressed }) => [
                                        styles.systemDeclineBtn,
                                        pressed && styles.systemAcceptBtnPressed,
                                      ]}
                                    >
                                      <Text style={styles.systemDeclineText}>Decline</Text>
                                    </Pressable>
                                  ) : null}
                                </View>
                              ) : null}
                              {showAcceptedState ? (
                                <View style={styles.systemAcceptedRow}>
                                  <Text style={styles.systemAcceptedText}>✓ Accepted</Text>
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
    backgroundColor: '#EFF2F6',
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
  headerRegion: {
    backgroundColor: HEADER_SURFACE,
  },
  headerOnlyBackRow: {
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  chatBody: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    flexDirection: 'column',
    backgroundColor: '#EFF2F6',
  },
  rentalCardSlot: {
    flexShrink: 0,
    paddingHorizontal: 0,
    backgroundColor: HEADER_SURFACE,
  },
  integratedBackBtn: {
    minWidth: 30,
    minHeight: 30,
    borderRadius: 15,
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.36)',
    shadowOpacity: 0,
    elevation: 0,
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
  topContext: {
    paddingHorizontal: 10,
    paddingBottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundColor: ui.surfaceGrouped,
  },
  headerBackSlot: {
    width: 64,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  messagesContent: {
    paddingTop: 10,
  },
  messagesContentBelowCard: {
    paddingTop: 10,
  },
  messagesContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  hint: {
    fontSize: 14,
    color: ui.textSubtle,
    textAlign: 'center',
    paddingTop: 24,
  },
  messageRow: {
    width: '100%',
  },
  messageStack: {
    marginBottom: 1,
  },
  messageStackNewSender: {
    marginTop: 7,
  },
  messageStackSameSender: {
    marginTop: 0,
  },
  messageStackSystem: {
    alignSelf: 'stretch',
    maxWidth: '100%',
  },
  messageStackRight: {
    alignSelf: 'flex-end',
  },
  messageStackLeft: {
    alignSelf: 'flex-start',
  },
  messageBubble: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 14,
  },
  right: {
    backgroundColor: '#285A95',
  },
  left: {
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D7DDE6',
  },
  cancellationSystemRow: {
    alignSelf: 'center',
    maxWidth: '92%',
    marginVertical: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
  },
  cancellationSystemText: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    color: ui.textSecondary,
    fontStyle: 'italic',
  },
  systemBubble: {
    alignSelf: 'center',
    backgroundColor: '#F5F7FB',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D5DCE6',
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  timestamp: {
    fontSize: 9,
    color: '#8A95A6',
    marginTop: 0,
  },
  timestampRight: {
    textAlign: 'right',
  },
  timestampLeft: {
    textAlign: 'left',
  },
  rightText: {
    color: ui.primaryOn,
    fontSize: 15,
    lineHeight: 20,
  },
  leftText: {
    color: ui.textPrimary,
    fontSize: 15,
    lineHeight: 20,
  },
  systemTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3F4D63',
    marginBottom: 3,
  },
  systemCardBody: {
    gap: 2,
  },
  systemLine: {
    fontSize: 12,
    color: '#4E5B70',
    lineHeight: 16,
  },
  systemLineLabel: {
    fontWeight: '600',
    color: '#3F4D63',
  },
  systemFallbackText: {
    fontSize: 12,
    color: '#4E5B70',
    lineHeight: 16,
  },
  systemWarningLine: {
    fontSize: 12,
    color: '#9E2D2F',
    lineHeight: 16,
    fontWeight: '600',
    marginTop: 1,
  },
  imageGroup: {
    marginTop: 7,
  },
  messageImage: {
    width: 156,
    height: 156,
    borderRadius: 8,
    marginTop: 4,
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
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D7DDE6',
    backgroundColor: '#F6F8FB',
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D6DCE6',
    minHeight: 38,
    maxHeight: 120,
    fontSize: 15,
    color: ui.textPrimary,
  },
  sendBtn: {
    marginLeft: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 58,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: ui.primary,
    overflow: 'hidden',
  },
  sendBtnPressed: {
    ...subtleControlPressed,
  },
  sendText: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.primaryOn,
  },
  sendTextDisabled: {
    color: ui.textSecondary,
  },
  systemActionRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 8,
  },
  systemAcceptBtn: {
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#B7C6DF',
    backgroundColor: '#EDF2FB',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  systemAcceptBtnPressed: {
    ...subtleControlPressed,
  },
  systemAcceptText: {
    color: '#305A95',
    fontSize: 11,
    fontWeight: '700',
  },
  systemDeclineBtn: {
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(220, 38, 38, 0.35)',
    backgroundColor: 'rgba(254, 242, 242, 0.9)',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  systemDeclineText: {
    color: '#B91C1C',
    fontSize: 11,
    fontWeight: '700',
  },
  systemAcceptedRow: {
    marginTop: 7,
  },
  systemAcceptedText: {
    color: '#6A778C',
    fontSize: 11,
    fontWeight: '600',
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
