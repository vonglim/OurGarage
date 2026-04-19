import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from '../components/KeyboardDismissScreen';
import { MainTabFab, useMainTabFabBottomReserve } from '../components/MainTabFab';
import {
  RequestListCardInner,
  requestListCardSurface,
} from '../components/RequestListCardInner';
import { formatMilesShort } from '../lib/requestDistance';
import { getOtherPartyRentalPreview } from '../lib/rentalParty';
import { removeOffersForRequest, useOffersStore } from '../store/offersStore';
import { openChatForRequest } from '../lib/openRequestChat';
import {
  getEffectiveRentalStatus,
  removeRequest,
  useRequestsStore,
} from '../store/requestsStore';
import { useTotalUnreadChatCount } from '../store/chatStore';
import { formatListingPriceWithUnit, useListingsStore } from '../store/listingsStore';
import { useProfile } from '../store/profileStore';
import { cardChrome, ui } from '@/constants/appUi';

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
  const [mode, setMode] = useState('requests');
  const profile = useProfile();
  const listings = useListingsStore((s) => s.listings);
  const offers = useOffersStore((state) => state.offers);
  const unreadCount = useTotalUnreadChatCount();
  const requests = useRequestsStore((s) => s.requests);

  const myEquipment = useMemo(
    () =>
      listings.filter(
        (l) => l.ownerUserId != null && l.ownerUserId !== '' && l.ownerUserId === profile.userId
      ),
    [listings, profile.userId]
  );
  const sortedRequests = useMemo(
    () => [...requests].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0)),
    [requests]
  );
  const swipeRefs = useRef(new Map<number, Swipeable>());
  const fabBottomReserve = useMainTabFabBottomReserve();

  const activeRentals = useMemo(
    () =>
      sortedRequests.filter(
        (r) => r.timestamp != null && getEffectiveRentalStatus(r) === 'active'
      ),
    [sortedRequests]
  );

  const goToChats = useCallback(() => {
    router.push('/(tabs)/chats');
  }, [router]);

  return (
    <KeyboardDismissScreen style={styles.screen}>
      <View style={styles.screenInner}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.screenTitle}>My Activity</Text>
          <View style={styles.segment}>
            <Pressable
              onPress={() => setMode('requests')}
              style={({ pressed }) => [
                styles.segmentItem,
                mode === 'requests' && styles.segmentItemActive,
                pressed && styles.segmentPressed,
              ]}
            >
              <Text style={[styles.segmentLabel, mode === 'requests' && styles.segmentLabelActive]}>
                My Requests
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMode('equipment')}
              style={({ pressed }) => [
                styles.segmentItem,
                mode === 'equipment' && styles.segmentItemActive,
                pressed && styles.segmentPressed,
              ]}
            >
              <Text style={[styles.segmentLabel, mode === 'equipment' && styles.segmentLabelActive]}>
                My Equipment
              </Text>
            </Pressable>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: fabBottomReserve }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sectionBlock}>
            <Pressable
              onPress={goToChats}
              style={({ pressed }) => [
                styles.messagesBanner,
                pressed && styles.messagesBannerPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                unreadCount > 0 ? `Messages, ${unreadCount} unread` : 'Messages'
              }
            >
              <Text style={styles.messagesRowLabel}>Messages →</Text>
              {unreadCount > 0 ? (
                <View style={styles.messagesUnreadPill}>
                  <Text style={styles.messagesUnreadPillText}>
                    {unreadCount > 99 ? '99+' : String(unreadCount)}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </View>

          <View style={styles.sectionRule} />

          {mode === 'requests' ? (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionHeading}>Active Rentals</Text>
              {activeRentals.length === 0 ? (
                <View style={styles.emptyBlock}>
                  <Text style={styles.emptyTitle}>No active rentals yet</Text>
                  <Text style={styles.emptySubline}>
                    Start by accepting an offer or listing equipment
                  </Text>
                </View>
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
                return (
                  <View key={ts} style={styles.activeCard}>
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
                    <View style={styles.activeBetweenCardSpacer} />
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
          ) : null}

          {mode === 'requests' ? <View style={styles.sectionRule} /> : null}

          {mode === 'requests' ? (
            <View style={[styles.sectionBlock, styles.sectionBlockLast]}>
              {sortedRequests.length === 0 ? (
                <Text style={styles.emptyText}>No requests yet. Tap + to request equipment.</Text>
              ) : (
                sortedRequests.map((request, idx) => {
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
            <View style={[styles.sectionBlock, styles.sectionBlockLast]}>
              {myEquipment.length === 0 ? (
                <Text style={styles.emptyText}>
                  No equipment listed yet. Tap + and choose List equipment.
                </Text>
              ) : (
                myEquipment.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() =>
                      router.push({
                        pathname: '/listing-detail',
                        params: { listingId: item.id },
                      })
                    }
                    style={({ pressed }) => [styles.listingCard, pressed && styles.listingCardPressed]}
                  >
                    <Text style={styles.listingTitle} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text style={styles.listingMeta} numberOfLines={1}>
                      {formatListingPriceWithUnit(item.price, item.priceUnit)}
                    </Text>
                    <Text style={styles.listingDistance} numberOfLines={1}>
                      {formatMilesShort(item.distance)}
                    </Text>
                    {item.description?.trim() ? (
                      <Text
                        style={styles.listingDesc}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {item.description.trim()}
                      </Text>
                    ) : null}
                  </Pressable>
                ))
              )}
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
    paddingBottom: 16,
    backgroundColor: '#F2F2F7',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    letterSpacing: -0.3,
    marginBottom: 14,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: '#ECECEC',
    borderRadius: 12,
    padding: 3,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  segmentItemActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentPressed: {
    opacity: 0.92,
  },
  segmentLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8E8E93',
  },
  segmentLabelActive: {
    color: '#000',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  sectionBlock: {
    marginBottom: 8,
  },
  sectionBlockLast: {
    marginBottom: 0,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6D6D72',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  sectionRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#C6C6C8',
    marginVertical: 22,
    alignSelf: 'stretch',
  },
  messagesBanner: {
    ...cardChrome,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  messagesBannerPressed: {
    opacity: ui.pressOpacity,
    backgroundColor: '#F7F7F9',
  },
  messagesRowLabel: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    letterSpacing: -0.2,
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
  emptyText: {
    fontSize: 15,
    color: ui.textSubtle,
    lineHeight: 22,
  },
  emptyBlock: {
    gap: 6,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3C3C43',
    lineHeight: 22,
  },
  emptySubline: {
    fontSize: 15,
    fontWeight: '400',
    color: ui.textSubtle,
    lineHeight: 22,
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
    fontSize: 13,
    color: '#48484A',
    marginTop: 10,
    fontWeight: '600',
    letterSpacing: -0.1,
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
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
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
    ...cardChrome,
    paddingVertical: 22,
    paddingHorizontal: ui.padCard,
    marginBottom: 16,
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
  listingCard: {
    ...cardChrome,
    marginBottom: 12,
  },
  listingCardPressed: {
    opacity: ui.pressOpacity,
  },
  listingTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
    marginBottom: 6,
    lineHeight: 22,
  },
  listingMeta: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3C3C43',
    marginBottom: 4,
  },
  listingDistance: {
    fontSize: 14,
    fontWeight: '500',
    color: '#636366',
    marginBottom: 4,
  },
  listingDesc: {
    fontSize: 14,
    color: '#636366',
  },
});
