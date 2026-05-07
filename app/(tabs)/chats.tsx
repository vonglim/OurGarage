import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Pressable } from '@/components/Pressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { KeyboardDismissScreen } from '@/components/KeyboardDismissScreen';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { useAuthUserId } from '@/lib/authUser';
import { getProfileNameForUserId, prefetchProfileNamesForUserIds } from '@/lib/profileDisplayName';
import { useMessageUnreadStore } from '@/store/messageUnreadStore';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { ui } from '@/constants/appUi';
import { useProfileCacheVersion } from '@/hooks/useProfileCacheVersion';

type InboxThread = {
  offerId: string;
  otherUserId: string;
  preview: string;
  latestTs: number;
  archived: boolean;
};

type OfferMessageLite = {
  offer_id: string;
  author_id: string;
  receiver_id: string | null;
  body: string | null;
  kind: string | null;
  created_at: string;
};

type OfferLite = {
  id: string;
  request_id: string | null;
  renter_id: string | null;
};

type RequestLite = {
  id: string;
  user_id: string | null;
};

function sortByLatest(a: InboxThread, b: InboxThread): number {
  const ta = a.latestTs;
  const tb = b.latestTs;
  return tb - ta;
}

export default function ChatsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useAuthUserId();
  const unreadByOfferId = useMessageUnreadStore((s) => s.unreadByOfferId);
  const [threads, setThreads] = useState<InboxThread[]>([]);
  useProfileCacheVersion();

  useFocusEffect(
    React.useCallback(() => {
      if (!me || !isSupabaseConfigured()) return;
      let cancelled = false;
      const supabase = getSupabase();

      const hydrate = async () => {
        const { data: msgRows, error } = await supabase
          .from('offer_messages')
          .select('offer_id,author_id,receiver_id,body,kind,created_at')
          .or(`author_id.eq.${me},receiver_id.eq.${me}`)
          .eq('kind', 'user_chat')
          .order('created_at', { ascending: false })
          .limit(800);
        if (error) {
          if (__DEV__) console.warn('[messages] fetch offer_messages failed', error.message);
          if (!cancelled) setThreads([]);
          return;
        }

        const rows = (msgRows ?? []) as OfferMessageLite[];
        const firstByOffer = new Map<string, OfferMessageLite>();
        for (const row of rows) {
          const offerId = String(row.offer_id ?? '').trim();
          if (!offerId || firstByOffer.has(offerId)) continue;
          firstByOffer.set(offerId, row);
        }
        const offerIds = [...firstByOffer.keys()];
        if (offerIds.length === 0) {
          if (!cancelled) setThreads([]);
          return;
        }

        const { data: offersData } = await supabase
          .from('offers')
          .select('id,request_id,renter_id')
          .in('id', offerIds);
        const offers = (offersData ?? []) as OfferLite[];
        const offerMetaById = new Map(offers.map((o) => [o.id, o]));
        const requestIds = offers
          .map((o) => (typeof o.request_id === 'string' ? o.request_id.trim() : ''))
          .filter((s) => s.length > 0);
        let requestById = new Map<string, RequestLite>();
        if (requestIds.length > 0) {
          const { data: reqData } = await supabase
            .from('requests')
            .select('id,user_id')
            .in('id', requestIds);
          requestById = new Map(((reqData ?? []) as RequestLite[]).map((r) => [r.id, r]));
        }

        const out: InboxThread[] = [];
        const userIdsForNames: string[] = [];
        for (const offerId of offerIds) {
          const latest = firstByOffer.get(offerId);
          if (!latest) continue;
          const offerMeta = offerMetaById.get(offerId);
          const requestMeta =
            offerMeta?.request_id && requestById.has(offerMeta.request_id)
              ? requestById.get(offerMeta.request_id)!
              : null;

          const authorId = String(latest.author_id ?? '').trim();
          const receiverId = String(latest.receiver_id ?? '').trim();
          let otherUserId = authorId === me ? receiverId : authorId;
          if (!otherUserId) {
            const renterId = String(offerMeta?.renter_id ?? '').trim();
            const posterId = String(requestMeta?.user_id ?? '').trim();
            otherUserId = renterId && renterId !== me ? renterId : posterId && posterId !== me ? posterId : '';
          }
          if (!otherUserId) continue;
          userIdsForNames.push(otherUserId);
          const text = String(latest.body ?? '').trim();
          out.push({
            offerId,
            otherUserId,
            preview: text || 'Message',
            latestTs: Date.parse(String(latest.created_at ?? '')) || Date.now(),
            archived: false,
          });
        }

        await prefetchProfileNamesForUserIds(userIdsForNames);
        if (cancelled) return;
        setThreads(out.sort(sortByLatest));
      };

      void hydrate();

      const id =
        typeof globalThis.crypto?.randomUUID === 'function'
          ? globalThis.crypto.randomUUID()
          : `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      const channel = supabase
        .channel(`messages-inbox:${me}:${id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'offer_messages' },
          (payload) => {
            const row = (payload.new ?? payload.old) as { author_id?: string; receiver_id?: string; kind?: string } | null;
            if (!row) return;
            const k = String(row.kind ?? '').trim();
            if (k !== 'user_chat') return;
            const a = String(row.author_id ?? '').trim();
            const r = String(row.receiver_id ?? '').trim();
            if (a !== me && r !== me) return;
            void hydrate();
          }
        )
        .subscribe();

      return () => {
        cancelled = true;
        void supabase.removeChannel(channel);
      };
    }, [me])
  );

  useEffect(() => {
    const ids: string[] = [];
    for (const t of threads) {
      if (t.otherUserId) ids.push(t.otherUserId);
    }
    if (ids.length > 0) {
      void prefetchProfileNamesForUserIds(ids);
    }
  }, [threads]);

  const active = useMemo(() => threads.filter((t) => !t.archived).sort(sortByLatest), [threads]);
  const archived = useMemo(() => threads.filter((t) => t.archived).sort(sortByLatest), [threads]);
  const hasAny = active.length > 0 || archived.length > 0;
  const rowName = (userId: string) => getProfileNameForUserId(userId);

  return (
    <ScreenWrapper style={styles.screenWrap}>
      <KeyboardDismissScreen style={styles.screen}>
        <View style={[styles.header, { paddingTop: 12 }]}>
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
                {active.map((thread, index) => {
                  const preview = thread.preview;
                  const unread = unreadByOfferId[thread.offerId] ?? 0;
                  const isLast = index === active.length - 1;
                  return (
                    <Pressable
                      key={thread.offerId}
                      onPress={() => {
                        router.push({ pathname: '/chat/[id]', params: { id: thread.offerId } });
                      }}
                      style={({ pressed }) => [
                        styles.row,
                        !isLast && styles.rowBorder,
                        pressed && styles.rowPressed,
                      ]}
                    >
                      <View style={styles.rowText}>
                        <View style={styles.nameRow}>
                          <Text style={styles.rowName} numberOfLines={1}>
                            {rowName(thread.otherUserId)}
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
                {archived.map((thread, index) => {
                  const preview = thread.preview;
                  const unread = unreadByOfferId[thread.offerId] ?? 0;
                  const isLast = index === archived.length - 1;
                  return (
                    <Pressable
                      key={thread.offerId}
                      onPress={() => {
                        router.push({ pathname: '/chat/[id]', params: { id: thread.offerId } });
                      }}
                      style={({ pressed }) => [
                        styles.rowArchived,
                        !isLast && styles.rowBorderArchived,
                        pressed && styles.rowPressedArchived,
                      ]}
                    >
                      <View style={styles.rowText}>
                        <View style={styles.nameRow}>
                          <Text style={styles.rowNameArchived} numberOfLines={1}>
                            {rowName(thread.otherUserId)}
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
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  screenWrap: {
    backgroundColor: ui.surfaceGrouped,
  },
  screen: {
    flex: 1,
    backgroundColor: ui.surfaceGrouped,
  },
  header: {
    paddingHorizontal: 0,
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
    paddingHorizontal: 0,
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
