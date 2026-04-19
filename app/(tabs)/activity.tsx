import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from '../components/KeyboardDismissScreen';
import { MainTabFab, useMainTabFabBottomReserve } from '../components/MainTabFab';
import {
  RequestListCardInner,
  requestListCardSurface,
} from '../components/RequestListCardInner';
import { getOtherPartyRentalPreview } from '../lib/rentalParty';
import { removeOffersForRequest, useOffersStore } from '../store/offersStore';
import { openChatForRequest } from '../lib/openRequestChat';
import { getEffectiveRentalStatus, getRequests, removeRequest } from '../store/requestsStore';
import { useTotalUnreadChatCount } from '../store/chatStore';
import { ui } from '@/constants/appUi';

type Segment = 'requests' | 'active' | 'tools';

function formatOffersReceived(n: number): string {
  if (n === 1) return '1 offer received';
  return `${n} offers received`;
}

function formatRentalStart(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function getTimeAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(diffMs / (60 * 1000));
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

export default function ActivityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const offers = useOffersStore((state) => state.offers);
  const unreadCount = useTotalUnreadChatCount();
  const [segment, setSegment] = useState<Segment>('requests');
  const [requests, setRequests] = useState<ReturnType<typeof getRequests>>([]);
  const swipeRefs = useRef(new Map<number, Swipeable>());
  const fabBottomReserve = useMainTabFabBottomReserve();

  const activeRentals = useMemo(
    () =>
      requests.filter(
        (r) => r.timestamp != null && getEffectiveRentalStatus(r) === 'active',
      ),
    [requests],
  );
  const singleActiveRental = activeRentals.length === 1;

  useFocusEffect(
    useCallback(() => {
      setRequests(getRequests().sort((a, b) => b.timestamp - a.timestamp));
    }, [])
  );

  const goToChats = useCallback(() => {
    router.push('/(tabs)/chats');
  }, [router]);

  return (
    <KeyboardDismissScreen style={styles.screen}>
      <View style={styles.screenInner}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerTopRow}>
          <Text style={styles.screenTitle} numberOfLines={1}>
            My Activity
          </Text>
          <Pressable
            onPress={goToChats}
            style={({ pressed }) => [
              styles.messagesEntry,
              pressed && styles.messagesEntryPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              unreadCount > 0
                ? `Messages, ${unreadCount} unread`
                : 'Messages'
            }
          >
            <Text style={styles.messagesEntryLabel}>Messages</Text>
            {unreadCount > 0 ? (
              <View style={styles.messagesUnreadPill}>
                <Text style={styles.messagesUnreadPillText}>
                  {unreadCount > 99 ? '99+' : String(unreadCount)}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>
        <View style={styles.toggle}>
          <Pressable
            onPress={() => setSegment('requests')}
            style={({ pressed }) => [
              styles.toggleOption,
              segment === 'requests' && styles.toggleOptionActive,
              pressed && styles.toggleOptionPressed,
            ]}
          >
            <Text
              style={[styles.toggleLabel, segment === 'requests' && styles.toggleLabelActive]}
            >
              Requests
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setSegment('active')}
            style={({ pressed }) => [
              styles.toggleOption,
              segment === 'active' && styles.toggleOptionActive,
              pressed && styles.toggleOptionPressed,
            ]}
          >
            <Text
              style={[styles.toggleLabel, segment === 'active' && styles.toggleLabelActive]}
            >
              Active
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setSegment('tools')}
            style={({ pressed }) => [
              styles.toggleOption,
              segment === 'tools' && styles.toggleOptionActive,
              pressed && styles.toggleOptionPressed,
            ]}
          >
            <Text style={[styles.toggleLabel, segment === 'tools' && styles.toggleLabelActive]}>
              My Tools
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: fabBottomReserve },
          segment === 'active' && activeRentals.length > 0
            ? {
                flexGrow: 1,
                minHeight: windowHeight - insets.top - 168,
              }
            : null,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {segment === 'active' ? (
          <View
            style={[
              styles.section,
              styles.activeSection,
              activeRentals.length > 0 && styles.activeSectionFill,
            ]}
          >
            {activeRentals.length === 0 ? (
              <Text style={[styles.emptyText, styles.activeEmptyCentered]}>
                No active rentals. Start a rental from a matched request after handoff confirmation.
              </Text>
            ) : (
              activeRentals.map((req) => {
                  const ts = req.timestamp as number;
                  const title = String(req.toolName ?? '').trim() || 'Untitled';
                  const party = getOtherPartyRentalPreview({
                    timestamp: ts,
                    posterUserId: req.posterUserId,
                    matched: req.matched,
                    acceptedOfferTimestamp: req.acceptedOfferTimestamp,
                  });
                  const rentalStart =
                    typeof req.rentalStart === 'number' && Number.isFinite(req.rentalStart)
                      ? req.rentalStart
                      : null;
                  const rowKey = ts;
                  return (
                    <View
                      key={rowKey}
                      style={[
                        styles.activeCard,
                        singleActiveRental && styles.activeCardSingle,
                      ]}
                    >
                      <View style={styles.activeCardInfo}>
                        <Text style={styles.activeToolName} numberOfLines={2}>
                          {title}
                        </Text>

                        <View style={styles.activeBlockSpacer} />

                        <Text style={styles.activeWithLine} numberOfLines={2}>
                          With: {party?.name ?? '—'} ⭐{' '}
                          {party != null ? party.rating.toFixed(1) : '—'}
                        </Text>

                        <View style={styles.activeBlockSpacer} />

                        <Text style={styles.activeStartLabel}>Start time</Text>
                        <Text style={styles.activeStartValue}>
                          {rentalStart != null ? formatRentalStart(rentalStart) : '—'}
                        </Text>
                        {rentalStart != null ? (
                          <Text style={styles.activeStartedAgo}>
                            Started {getTimeAgo(rentalStart)}
                          </Text>
                        ) : null}

                        <View style={styles.activeBlockSpacer} />

                        <View style={styles.activeStatusRow}>
                          <View style={styles.activeStatusDot} />
                          <Text style={styles.activeStatusLabel}>Active</Text>
                        </View>
                      </View>

                      {singleActiveRental ? (
                        <View style={styles.activeActionsPush} />
                      ) : (
                        <View style={styles.activeBetweenCardSpacer} />
                      )}

                      <View style={styles.activeActionsColumn}>
                        <Pressable
                          style={({ pressed }) => [
                            styles.activeBtnPrimaryLarge,
                            pressed && styles.activeBtnPressed,
                          ]}
                          onPress={() => {
                            if (ts == null) return;
                            openChatForRequest(router, ts);
                          }}
                        >
                          <Text style={styles.activeBtnPrimaryLargeText}>Message</Text>
                        </Pressable>
                        <View style={styles.activeBtnStackGap} />
                        <Pressable
                          style={({ pressed }) => [
                            styles.activeBtnPrimaryLarge,
                            pressed && styles.activeBtnPressed,
                          ]}
                          onPress={() => {
                            if (ts == null) return;
                            router.push({
                              pathname: '/end-rental',
                              params: { requestId: String(ts) },
                            });
                          }}
                        >
                          <Text style={styles.activeBtnPrimaryLargeText}>End Rental</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })
            )}
          </View>
        ) : segment === 'requests' ? (
          <View style={styles.section}>
            {requests.length === 0 ? (
              <Text style={styles.emptyText}>
                No requests yet. Tap + to request a tool.
              </Text>
            ) : (
              requests.map((request, idx) => {
                const matched = !!request.matched;
                const rowKey = request.timestamp ?? idx;
                const r = request as { id?: number | string; timestamp?: number | null };
                const requestKey = r.id ?? r.timestamp;
                const offerCount =
                  requestKey != null && requestKey !== ''
                    ? offers.filter(
                        (o) =>
                          !o.declined && String(o.requestId) === String(requestKey)
                      ).length
                    : 0;
                const card = (
                  <Pressable
                    style={({ pressed }) => [
                      requestListCardSurface.card,
                      matched && styles.requestCardMatched,
                      pressed && styles.requestCardPressed,
                    ]}
                    onPress={() => {
                      if (request.timestamp == null) return;
                      router.push({
                        pathname: '/request-details',
                        params: { requestId: String(request.timestamp) },
                      });
                    }}
                  >
                    <RequestListCardInner
                      req={request}
                      matched={matched}
                      timeAgoText={
                        request.timestamp != null
                          ? getTimeAgo(request.timestamp)
                          : null
                      }
                    />
                    {request.timestamp != null && (
                      <Text style={styles.offersReceived}>
                        {formatOffersReceived(offerCount)}
                      </Text>
                    )}
                  </Pressable>
                );

                if (matched) {
                  return (
                    <View key={rowKey} style={styles.cardRowWrap}>
                      {card}
                    </View>
                  );
                }

                return (
                  <View key={rowKey} style={styles.cardRowWrap}>
                    <Swipeable
                      ref={(el) => {
                        const ts = request.timestamp;
                        if (ts == null) return;
                        if (el) swipeRefs.current.set(ts, el);
                        else swipeRefs.current.delete(ts);
                      }}
                      overshootRight={false}
                      renderRightActions={() => (
                        <View style={styles.rightActionsRow}>
                          <Pressable
                            style={styles.editAction}
                            onPress={() => {
                              if (request.timestamp == null) return;
                              swipeRefs.current.get(request.timestamp)?.close();
                              router.push({
                                pathname: '/request-a-tool',
                                params: { editTimestamp: String(request.timestamp) },
                              });
                            }}
                          >
                            <Text style={styles.editActionText}>Edit</Text>
                          </Pressable>
                          <Pressable
                            style={styles.deleteAction}
                            onPress={() => {
                              if (request.timestamp == null) return;
                              removeOffersForRequest(request.timestamp);
                              removeRequest(request.timestamp);
                              setRequests(getRequests());
                            }}
                          >
                            <Text style={styles.deleteActionText}>Delete</Text>
                          </Pressable>
                        </View>
                      )}
                    >
                      {card}
                    </Swipeable>
                  </View>
                );
              })
            )}
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.placeholderTitle}>My tools</Text>
            <Text style={styles.emptyText}>
              Listing tools for others to rent is coming soon. Tap + and choose List My Tool to open
              the placeholder screen.
            </Text>
          </View>
        )}
      </ScrollView>

      <MainTabFab />
      </View>
    </KeyboardDismissScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  screenInner: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: '#F2F2F7',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  screenTitle: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    letterSpacing: -0.3,
    minWidth: 0,
  },
  messagesEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
    gap: 8,
  },
  messagesEntryPressed: {
    opacity: ui.pressOpacity,
    backgroundColor: '#F7F7F9',
  },
  messagesEntryLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.primary,
  },
  messagesUnreadPill: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  messagesUnreadPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: '#E5E5EA',
    borderRadius: 10,
    padding: 3,
  },
  toggleOption: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  toggleOptionActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  toggleOptionPressed: {
    opacity: 0.92,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6D6D72',
  },
  toggleLabelActive: {
    color: '#000',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  section: {
    paddingBottom: 8,
  },
  activeSection: {
    alignItems: 'center',
    width: '100%',
  },
  activeSectionFill: {
    flexGrow: 1,
  },
  activeEmptyCentered: {
    textAlign: 'center',
    alignSelf: 'center',
    maxWidth: 320,
  },
  emptyText: {
    fontSize: 15,
    color: ui.textSubtle,
    lineHeight: 22,
  },
  placeholderTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  cardRowWrap: {
    marginBottom: 14,
  },
  requestCardMatched: {
    backgroundColor: '#F4FAF4',
    borderColor: '#C5E0C7',
  },
  requestCardPressed: {
    opacity: ui.pressOpacity,
  },
  offersReceived: {
    fontSize: 12,
    color: '#868686',
    marginTop: 8,
    fontWeight: '500',
  },
  rightActionsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  editAction: {
    backgroundColor: ui.primary,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
  },
  editActionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteAction: {
    backgroundColor: '#E53935',
    justifyContent: 'center',
    alignItems: 'center',
    width: 88,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
  },
  deleteActionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  activeCard: {
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'stretch',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 22,
    paddingHorizontal: 20,
    marginBottom: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
  },
  activeCardSingle: {
    flex: 1,
    marginBottom: 0,
  },
  activeCardInfo: {
    alignItems: 'center',
  },
  activeToolName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  activeBlockSpacer: {
    height: 16,
  },
  activeWithLine: {
    fontSize: 15,
    color: '#333',
    textAlign: 'center',
    alignSelf: 'stretch',
    lineHeight: 22,
  },
  activeStartLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6D6D72',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  activeStartValue: {
    fontSize: 15,
    color: '#111',
    textAlign: 'center',
    alignSelf: 'stretch',
    lineHeight: 22,
  },
  activeStartedAgo: {
    marginTop: 6,
    fontSize: 14,
    color: ui.textSubtle,
    textAlign: 'center',
    alignSelf: 'stretch',
    lineHeight: 20,
  },
  activeStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  activeStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2E7D32',
  },
  activeStatusLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1B5E20',
  },
  activeActionsPush: {
    flexGrow: 1,
    flexShrink: 0,
    minHeight: 48,
  },
  activeBetweenCardSpacer: {
    height: 24,
  },
  activeActionsColumn: {
    width: '100%',
    alignSelf: 'stretch',
  },
  activeBtnStackGap: {
    height: 14,
  },
  activeBtnPrimaryLarge: {
    alignSelf: 'stretch',
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.primary,
  },
  activeBtnPressed: {
    opacity: ui.pressOpacity,
  },
  activeBtnPrimaryLargeText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
