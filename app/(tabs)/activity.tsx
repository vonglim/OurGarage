import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AppNotification } from '@/store/notificationsStore';
import { CardPressable } from '@/components/CardPressable';
import { Pressable } from '@/components/Pressable';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from '@/components/KeyboardDismissScreen';
import { MainTabFab, useMainTabFabBottomReserve } from '@/components/MainTabFab';
import {
  RequestListCardInner,
  requestListCardSurface,
} from '@/components/RequestListCardInner';
import { formatMilesShort } from '@/lib/requestDistance';
import { getOtherPartyRentalPreview } from '@/lib/rentalParty';
import {
  activityRequestInvolvesUser,
  getRequestOwnerId,
  offerCountsForActivityRow,
  rentalRequestInvolvesUser,
} from '@/lib/activityScope';
import { markAllNotificationsAsRead } from '@/lib/markNotificationsRead';
import { getRequestSupabaseRowId } from '@/lib/requestOwnership';
import { formatUsd, getNumericOfferPrice } from '@/lib/money';
import type { Offer } from '@/store/offersStore';
import { removeOffersForRequest, useOffersStore } from '@/store/offersStore';
import { openChatForRequest } from '@/lib/openRequestChat';
import { refreshActivityScreenFromSupabase } from '@/lib/supabaseActivityRefresh';
import {
  getEffectiveRentalStatus,
  removeRequest,
  resolveRequestFromRouteId,
  useRequestsStore,
} from '@/store/requestsStore';
import { useNotificationsStore } from '@/store/notificationsStore';
import { useTotalUnreadChatCount } from '@/store/chatStore';
import { formatListingPriceWithUnit, useListingsStore } from '@/store/listingsStore';
import { useAuthUserId } from '@/lib/authUser';
import {
  cardChrome,
  primarySolidPressed,
  shadowKey,
  shadowSegmentActive,
  shadowSegmentAttention,
  ui,
} from '@/constants/appUi';

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

function visibleUnreadForUser(n: AppNotification, userId: string): boolean {
  return !n.read && (n.forUserId == null || n.forUserId === '' || n.forUserId === userId);
}

function formatSectionCount(n: number): string {
  if (n <= 0) return '';
  return n > 99 ? '99+' : String(n);
}

function byTimestampDesc(
  a: { timestamp?: number | null },
  b: { timestamp?: number | null }
): number {
  return (b.timestamp ?? 0) - (a.timestamp ?? 0);
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

type OutgoingOfferStatus = 'pending' | 'countered' | 'awaiting_poster' | 'accepted' | 'declined';

function getOutgoingOfferStatus(o: Offer, req: unknown): OutgoingOfferStatus {
  if (o.status === 'declined' || o.status === 'closed') return 'declined';
  if (o.status === 'accepted') return 'accepted';
  if (o.status === 'pending_confirmation') return 'awaiting_poster';
  if (!req || typeof (req as { timestamp?: number }).timestamp !== 'number') return 'pending';
  const r = req as { matched?: boolean; acceptedOfferId?: string | null };
  if (r.matched === true && typeof r.acceptedOfferId === 'string' && r.acceptedOfferId.trim() !== '') {
    if (r.acceptedOfferId === o.id) return 'accepted';
    return 'declined';
  }
  const st = getEffectiveRentalStatus(req as Parameters<typeof getEffectiveRentalStatus>[0]);
  if (st !== 'pending') return 'declined';
  const hasRenterAccepts = o.messageHistory?.some((h) => h.kind === 'renter_accepts') === true;
  if (hasRenterAccepts && o.lastUpdatedBy === o.renterId) {
    return 'awaiting_poster';
  }
  const ownerId = getRequestOwnerId(req as Record<string, unknown>);
  if (ownerId != null && o.lastUpdatedBy === ownerId && o.lastUpdatedBy !== o.renterId) {
    return 'countered';
  }
  return 'pending';
}

type ActivityTab = 'requests' | 'offers' | 'rentals';

function outgoingOfferStatusLabel(s: OutgoingOfferStatus): string {
  switch (s) {
    case 'pending':
      return 'Pending';
    case 'countered':
      return 'Countered';
    case 'awaiting_poster':
      return 'Awaiting owner';
    case 'accepted':
      return 'Accepted';
    case 'declined':
      return 'Declined';
    default:
      return s;
  }
}

export default function ActivityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<ActivityTab>('requests');
  const me = useAuthUserId();
  const listings = useListingsStore((s) => s.listings);
  const offers = useOffersStore((state) => state.offers);
  const notifications = useNotificationsStore((s) => s.notifications);
  const unreadCount = useTotalUnreadChatCount();
  const requests = useRequestsStore((s) => s.requests);

  useFocusEffect(
    useCallback(() => {
      void refreshActivityScreenFromSupabase();
      markAllNotificationsAsRead();
    }, [])
  );

  const myEquipment = useMemo(
    () =>
      listings.filter(
        (l) => l.ownerUserId != null && l.ownerUserId !== '' && l.ownerUserId === me
      ),
    [listings, me]
  );
  const activityRequests = useMemo(
    () => requests.filter((r) => activityRequestInvolvesUser(r as Record<string, unknown>, me)),
    [requests, me]
  );
  const sortedActivityPool = useMemo(
    () => [...activityRequests].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0)),
    [activityRequests]
  );
  /** Requests tab: only rows you own (not other users' browse listings). */
  const ownedRequestsSorted = useMemo(
    () =>
      sortedActivityPool.filter(
        (r) => getRequestOwnerId(r as Record<string, unknown>) === me
      ),
    [sortedActivityPool, me]
  );
  const swipeRefs = useRef(new Map<number, Swipeable>());
  const fabBottomReserve = useMainTabFabBottomReserve();

  const activeRentals = useMemo(
    () =>
      sortedActivityPool.filter(
        (r) =>
          r.timestamp != null &&
          getEffectiveRentalStatus(r) === 'active' &&
          rentalRequestInvolvesUser(r as Record<string, unknown>, me)
      ),
    [sortedActivityPool, me]
  );

  const matchedRentals = useMemo(
    () =>
      sortedActivityPool.filter(
        (r) =>
          getEffectiveRentalStatus(r) === 'matched' &&
          rentalRequestInvolvesUser(r as Record<string, unknown>, me)
      ),
    [sortedActivityPool, me]
  );

  const pastRentals = useMemo(
    () =>
      [...sortedActivityPool]
        .filter(
          (r) =>
            getEffectiveRentalStatus(r) === 'completed' &&
            rentalRequestInvolvesUser(r as Record<string, unknown>, me)
        )
        .sort(byTimestampDesc),
    [sortedActivityPool, me]
  );

  const activeRentalsSorted = useMemo(
    () => [...activeRentals].sort(byTimestampDesc),
    [activeRentals]
  );

  const matchedRentalsSorted = useMemo(
    () => [...matchedRentals].sort(byTimestampDesc),
    [matchedRentals]
  );

  const activeRequestsSorted = useMemo(
    () =>
      [...ownedRequestsSorted]
        .filter((r) => getEffectiveRentalStatus(r) !== 'completed')
        .sort(byTimestampDesc),
    [ownedRequestsSorted]
  );

  const pastRequestsSorted = useMemo(
    () =>
      [...ownedRequestsSorted]
        .filter((r) => getEffectiveRentalStatus(r) === 'completed')
        .sort(byTimestampDesc),
    [ownedRequestsSorted]
  );

  const myLenderOffers = useMemo(
    () =>
      offers
        .filter((o) => {
          if (typeof o.renterId !== 'string' || o.renterId !== me) return false;
          if (o.status === 'declined' || o.status === 'closed' || o.status === 'accepted') {
            return false;
          }
          const req = requests.find((r) => r.timestamp === o.requestId);
          const st = getOutgoingOfferStatus(o, req);
          return st !== 'accepted';
        })
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [offers, me, requests]
  );

  const offersSectionBadgeCount = useMemo(() => {
    let n = 0;
    for (const o of myLenderOffers) {
      const req = requests.find((r) => r.timestamp === o.requestId);
      const st = getOutgoingOfferStatus(o, req);
      if (st === 'pending' || st === 'countered') n += 1;
    }
    return n;
  }, [myLenderOffers, requests, offers]);

  const rentalsTotalCount =
    matchedRentalsSorted.length + activeRentalsSorted.length + pastRentals.length;

  const requestsActivityCount = useMemo(() => {
    let total = 0;
    for (const n of notifications) {
      if (!visibleUnreadForUser(n, me)) continue;
      if (n.type === 'new_offer' || n.type === 'counter_offer') total += 1;
    }
    for (const r of ownedRequestsSorted) {
      const row = r as Record<string, unknown>;
      if (getRequestOwnerId(row) !== me || r.matched) continue;
      if (getEffectiveRentalStatus(r) !== 'pending') continue;
      const ts = r.timestamp;
      if (ts == null || !Number.isFinite(ts)) continue;
      const hasOffer = offers.some(
        (o) => o.requestId === ts && offerCountsForActivityRow(o, row, me)
      );
      if (!hasOffer) continue;
      const hasUnreadOfferNotif = notifications.some(
        (x) =>
          visibleUnreadForUser(x, me) &&
          (x.type === 'new_offer' || x.type === 'counter_offer') &&
          resolveRequestFromRouteId(x.requestId)?.timestamp === ts
      );
      if (!hasUnreadOfferNotif) total += 1;
    }
    return total;
  }, [notifications, ownedRequestsSorted, offers, me]);

  /** Active + matched rentals (pipeline items to attend to in this tab). */
  const rentalsActivityCount = useMemo(() => {
    let total = 0;
    for (const r of sortedActivityPool) {
      const st = getEffectiveRentalStatus(r);
      if (st !== 'active' && st !== 'matched') continue;
      if (!rentalRequestInvolvesUser(r as Record<string, unknown>, me)) continue;
      total += 1;
    }
    return total;
  }, [sortedActivityPool, me]);

  const goToChats = useCallback(() => {
    router.push('/(tabs)/chats');
  }, [router]);

  function renderRequestRow(request: (typeof ownedRequestsSorted)[number], idx: number) {
    const matched = !!request.matched;
    const rowKey = request.timestamp ?? idx;
    const ts = request.timestamp;
    const requestDetailsId = getRequestSupabaseRowId(request as Record<string, unknown>);
    const offerCount =
      ts != null && Number.isFinite(ts)
        ? offers.filter(
            (o) =>
              o.requestId === ts &&
              offerCountsForActivityRow(o, request as Record<string, unknown>, me)
          ).length
        : 0;
    const card = (
      <CardPressable
        style={[
          requestListCardSurface.card,
          matched && styles.requestCardMatched,
        ]}
        onPress={() => {
          if (!requestDetailsId) return;
          router.push({
            pathname: '/request-details',
            params: { requestId: requestDetailsId },
          });
        }}
        disabled={!requestDetailsId}
      >
        <RequestListCardInner
          insideParentPressable
          req={request}
          matched={matched}
          timeAgoText={
            request.timestamp != null ? getTimeAgo(request.timestamp) : null
          }
        />
        {request.timestamp != null && (
          <Text style={styles.offersReceived}>{formatOffersReceived(offerCount)}</Text>
        )}
      </CardPressable>
    );

    if (matched) {
      return (
        <View key={rowKey} style={styles.cardRowWrap}>
          {card}
        </View>
      );
    }

    const isOwner =
      getRequestOwnerId(request as Record<string, unknown>) === me;
    if (!isOwner) {
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
  }

  function statusPillStyle(s: OutgoingOfferStatus) {
    switch (s) {
      case 'accepted':
        return { bg: '#E8F5E9', fg: '#1B5E20' };
      case 'countered':
        return { bg: '#FFF8E1', fg: '#F57F17' };
      case 'awaiting_poster':
        return { bg: '#E3F2FD', fg: '#1565C0' };
      case 'declined':
        return { bg: '#FCE8E6', fg: '#B71C1C' };
      default:
        return { bg: ui.surfaceNeutral, fg: ui.textSecondary };
    }
  }

  function renderMyOfferRow(o: Offer) {
    const req = requests.find((r) => r.timestamp === o.requestId);
    const title = String((req as { toolName?: string } | undefined)?.toolName ?? '').trim() || 'Equipment request';
    const st = getOutgoingOfferStatus(o, req);
    const pill = statusPillStyle(st);
    const price = getNumericOfferPrice(o);
    return (
      <CardPressable
        key={o.id}
        onPress={() =>
          router.push({
            pathname: '/offer-detail',
            params: { requestId: String(o.requestId), offerId: o.id },
          })
        }
        style={({ pressed }) => [styles.offerRowCard, pressed && styles.offerRowCardPressed]}
      >
        <View style={styles.offerRowTop}>
          <Text style={styles.offerRowTitle} numberOfLines={2}>
            {title}
          </Text>
          <View style={[styles.statusPill, { backgroundColor: pill.bg }]}>
            <Text style={[styles.statusPillText, { color: pill.fg }]}>{outgoingOfferStatusLabel(st)}</Text>
          </View>
        </View>
        <Text style={styles.offerRowMeta}>
          Your offer {formatUsd(price)} · {getTimeAgo(o.updatedAt)}
        </Text>
      </CardPressable>
    );
  }

  return (
    <KeyboardDismissScreen style={styles.screen}>
      <ScreenEntrance style={styles.screenInner}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.screenTitle} numberOfLines={1}>
              My Activity
            </Text>
            <Pressable
              pressOpacityFeedback={false}
              haptic
              onPress={goToChats}
              style={({ pressed }) => [styles.messagesPill, pressed && styles.messagesPillPressed]}
              accessibilityRole="button"
              accessibilityLabel={unreadCount > 0 ? `Messages, ${unreadCount} unread` : 'Messages'}
            >
              <Text style={styles.messagesPillLabel}>Messages</Text>
              {unreadCount > 0 ? (
                <View style={styles.messagesPillBadge}>
                  <Text style={styles.messagesPillBadgeText}>{formatSectionCount(unreadCount)}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>

          <View style={styles.tabRow}>
            <Pressable
              onPress={() => setTab('requests')}
              style={({ pressed }) => [
                styles.tabCell,
                tab === 'requests' ? styles.tabCellActive : styles.tabCellInactive,
                tab !== 'requests' && requestsActivityCount > 0 && styles.tabCellMutedAttention,
                pressed && styles.tabPressed,
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === 'requests' }}
              accessibilityLabel={`Requests, ${requestsActivityCount} updates`}
            >
              <Text style={[styles.tabLabel, tab === 'requests' && styles.tabLabelActive]}>Requests</Text>
              {requestsActivityCount > 0 ? (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{formatSectionCount(requestsActivityCount)}</Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable
              onPress={() => setTab('offers')}
              style={({ pressed }) => [
                styles.tabCell,
                tab === 'offers' ? styles.tabCellActive : styles.tabCellInactive,
                tab !== 'offers' && offersSectionBadgeCount > 0 && styles.tabCellMutedAttention,
                pressed && styles.tabPressed,
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === 'offers' }}
              accessibilityLabel={`Offers, ${offersSectionBadgeCount} need attention`}
            >
              <Text style={[styles.tabLabel, tab === 'offers' && styles.tabLabelActive]}>Offers</Text>
              {offersSectionBadgeCount > 0 ? (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{formatSectionCount(offersSectionBadgeCount)}</Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable
              onPress={() => setTab('rentals')}
              style={({ pressed }) => [
                styles.tabCell,
                tab === 'rentals' ? styles.tabCellActive : styles.tabCellInactive,
                tab !== 'rentals' &&
                  (rentalsActivityCount > 0 || pastRentals.length > 0) &&
                  styles.tabCellMutedAttention,
                pressed && styles.tabPressed,
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === 'rentals' }}
              accessibilityLabel={`Rentals, ${rentalsTotalCount} items`}
            >
              <Text style={[styles.tabLabel, tab === 'rentals' && styles.tabLabelActive]}>Rentals</Text>
              {rentalsTotalCount > 0 ? (
                <View style={tab === 'rentals' ? styles.tabBadge : styles.tabBadgeMuted}>
                  <Text style={tab === 'rentals' ? styles.tabBadgeText : styles.tabBadgeMutedText}>
                    {formatSectionCount(rentalsTotalCount)}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: fabBottomReserve }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {tab === 'requests' ? (
            <View
              style={[
                styles.tabPanel,
                requestsActivityCount > 0 && styles.tabPanelAttention,
              ]}
            >
              <Text style={styles.tabPanelSubline}>
                Your open and past requests · offers received on each card
              </Text>
              {activeRequestsSorted.length === 0 && pastRequestsSorted.length === 0 ? (
                <Text style={styles.emptyText}>No requests yet. Tap + to request equipment.</Text>
              ) : (
                <>
                  {activeRequestsSorted.length > 0 ? (
                    <>
                      <Text style={styles.activePastHeading}>Active</Text>
                      {activeRequestsSorted.map((request, idx) => renderRequestRow(request, idx))}
                    </>
                  ) : null}
                  {pastRequestsSorted.length > 0 ? (
                    <>
                      {activeRequestsSorted.length > 0 ? (
                        <View style={[styles.sectionRule, styles.sectionRuleTight]} />
                      ) : null}
                      <Text style={styles.activePastHeading}>Past</Text>
                      {pastRequestsSorted.map((request, idx) =>
                        renderRequestRow(request, idx + activeRequestsSorted.length)
                      )}
                    </>
                  ) : null}
                </>
              )}
              <View style={[styles.sectionRule, styles.sectionRuleTight]} />
              <Text style={styles.activePastHeading}>Your equipment</Text>
              {myEquipment.length === 0 ? (
                <Text style={styles.emptyText}>
                  No equipment listed yet. Tap + and choose List equipment.
                </Text>
              ) : (
                myEquipment.map((item) => (
                  <CardPressable
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
                      <Text style={styles.listingDesc} numberOfLines={1} ellipsizeMode="tail">
                        {item.description.trim()}
                      </Text>
                    ) : null}
                  </CardPressable>
                ))
              )}
            </View>
          ) : null}

          {tab === 'offers' ? (
            <View
              style={[
                styles.tabPanel,
                offersSectionBadgeCount > 0 && styles.tabPanelAttention,
              ]}
            >
              <Text style={styles.tabPanelSubline}>
                Bids you placed · status reflects the poster’s response
              </Text>
              {myLenderOffers.length === 0 ? (
                <Text style={styles.emptyText}>No offers yet. Browse requests and tap Make offer.</Text>
              ) : (
                myLenderOffers.map((o) => renderMyOfferRow(o))
              )}
            </View>
          ) : null}

          {tab === 'rentals' ? (
            <View
              style={[
                styles.tabPanel,
                (rentalsActivityCount > 0 || pastRentals.length > 0) && styles.tabPanelAttention,
              ]}
            >
              <Text style={styles.tabPanelSubline}>
                Accepted matches, active rentals, and completed history
              </Text>
              {activeRentalsSorted.length === 0 &&
              matchedRentalsSorted.length === 0 &&
              pastRentals.length === 0 ? (
                <View style={styles.emptyBlock}>
                  <Text style={styles.emptyTitle}>No rentals yet</Text>
                  <Text style={styles.emptySubline}>
                    When an offer is accepted you will see it here, then active and completed stages.
                  </Text>
                </View>
              ) : (
                <>
                  {matchedRentalsSorted.length > 0 ? (
                    <>
                      <Text style={styles.activePastHeading}>Accepted</Text>
                      {matchedRentalsSorted.map((req) => {
                      const ts = req.timestamp as number | undefined;
                      const title = String(req.toolName ?? '').trim() || 'Untitled';
                      const detailsId = getRequestSupabaseRowId(req as Record<string, unknown>);
                      return (
                        <CardPressable
                          key={ts != null ? `m-${ts}` : title}
                          onPress={() => {
                            if (!detailsId) return;
                            router.push({
                              pathname: '/request-details',
                              params: { requestId: detailsId },
                            });
                          }}
                          disabled={!detailsId}
                          style={({ pressed }) => [
                            styles.matchedRentalCard,
                            pressed && styles.matchedRentalCardPressed,
                          ]}
                        >
                          <Text style={styles.matchedRentalTitle} numberOfLines={2}>
                            {title}
                          </Text>
                          <Text style={styles.matchedRentalHint}>
                            Open for agreement, handoff, or messages
                          </Text>
                        </CardPressable>
                      );
                    })}
                  </>
                ) : null}
                {activeRentalsSorted.length > 0 ? (
                  <>
                    {matchedRentalsSorted.length > 0 ? (
                      <View style={[styles.sectionRule, styles.sectionRuleTight]} />
                    ) : null}
                    <Text style={styles.activePastHeading}>Active</Text>
                    {activeRentalsSorted.map((req) => {
                        const ts = req.timestamp as number;
                        const title = String(req.toolName ?? '').trim() || 'Untitled';
                        const party = getOtherPartyRentalPreview({
                          timestamp: ts,
                          posterUserId: req.posterUserId,
                          matched: req.matched,
                          acceptedOfferId: req.acceptedOfferId,
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
                                pressOpacityFeedback={false}
                                haptic
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
                                pressOpacityFeedback={false}
                                haptic
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
                      })}
                    </>
                  ) : null}
                  {pastRentals.length > 0 ? (
                    <>
                      {activeRentalsSorted.length + matchedRentalsSorted.length > 0 ? (
                        <View style={[styles.sectionRule, styles.sectionRuleTight]} />
                      ) : null}
                      <Text style={styles.activePastHeading}>Completed</Text>
                      {pastRentals.map((req) => {
                        const ts = req.timestamp as number | undefined;
                        const title = String(req.toolName ?? '').trim() || 'Untitled';
                        const detailsId = getRequestSupabaseRowId(req as Record<string, unknown>);
                        return (
                          <CardPressable
                            key={ts != null ? String(ts) : title}
                            onPress={() => {
                              if (!detailsId) return;
                              router.push({
                                pathname: '/request-details',
                                params: { requestId: detailsId },
                              });
                            }}
                            disabled={!detailsId}
                            style={({ pressed }) => [
                              styles.matchedRentalCard,
                              styles.pastRentalCard,
                              pressed && styles.matchedRentalCardPressed,
                            ]}
                          >
                            <Text style={styles.matchedRentalTitle} numberOfLines={2}>
                              {title}
                            </Text>
                            <Text style={styles.matchedRentalHint}>Completed rental — tap for details</Text>
                          </CardPressable>
                        );
                      })}
                    </>
                  ) : null}
                </>
              )}
            </View>
          ) : null}
        </ScrollView>

        <MainTabFab />
      </ScreenEntrance>
    </KeyboardDismissScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: ui.surfaceGrouped,
  },
  screenInner: {
    flex: 1,
  },
  header: {
    paddingHorizontal: ui.padScreenH,
    paddingBottom: ui.spaceMd,
    backgroundColor: ui.surfaceGrouped,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
    zIndex: 2,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: ui.textPrimary,
    letterSpacing: -0.3,
    flex: 1,
    minWidth: 0,
  },
  messagesPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: ui.surfaceNeutral,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  messagesPillPressed: {
    opacity: 0.9,
  },
  messagesPillLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.primary,
  },
  messagesPillBadge: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: ui.primary,
    alignItems: 'center',
  },
  messagesPillBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginTop: ui.spaceMd,
  },
  tabCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 12,
    minHeight: 44,
  },
  tabCellInactive: {
    backgroundColor: ui.surfaceNeutral,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  tabCellActive: {
    backgroundColor: ui.surfaceTintPrimary,
    borderWidth: 2,
    borderColor: ui.primary,
    ...shadowSegmentActive,
  },
  tabCellMutedAttention: {
    borderColor: 'rgba(11, 31, 58, 0.14)',
    ...shadowSegmentAttention,
  },
  tabPressed: {
    opacity: 0.92,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: ui.textSecondary,
    letterSpacing: -0.1,
  },
  tabLabelActive: {
    color: ui.primary,
  },
  tabBadge: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: ui.primary,
    alignItems: 'center',
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
  tabBadgeMuted: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: ui.surfaceGrouped,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    alignItems: 'center',
  },
  tabBadgeMutedText: {
    fontSize: 11,
    fontWeight: '800',
    color: ui.textSecondary,
  },
  tabPanel: {
    ...cardChrome,
    padding: ui.padCard + 2,
  },
  tabPanelAttention: {
    borderColor: 'rgba(11, 31, 58, 0.12)',
    ...shadowSegmentAttention,
  },
  tabPanelSubline: {
    fontSize: 14,
    color: ui.textSecondary,
    lineHeight: 20,
    marginBottom: ui.spaceMd,
  },
  offerRowCard: {
    ...cardChrome,
    marginBottom: 10,
    paddingVertical: 12,
    paddingHorizontal: ui.padCard,
  },
  offerRowCardPressed: {
    backgroundColor: ui.surfaceTintPrimary,
  },
  offerRowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 6,
  },
  offerRowTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: ui.textPrimary,
  },
  offerRowMeta: {
    fontSize: 14,
    color: ui.textSecondary,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  subSectionHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.55,
    marginBottom: 10,
    marginTop: 4,
  },
  sectionRuleTight: {
    marginVertical: ui.spaceMd,
  },
  matchedRentalCard: {
    ...cardChrome,
    marginBottom: 12,
    paddingVertical: 14,
    paddingHorizontal: ui.padCard,
  },
  matchedRentalCardPressed: {
    backgroundColor: ui.surfaceTintPrimary,
  },
  matchedRentalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 4,
  },
  matchedRentalHint: {
    fontSize: 14,
    color: ui.textSecondary,
    lineHeight: 20,
  },
  activePastHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: ui.textPrimary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 2,
  },
  pastRentalCard: {
    opacity: 0.92,
    backgroundColor: ui.surfaceStriped,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: ui.padScreenH,
    paddingTop: ui.padScreenH,
  },
  sectionRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: ui.border,
    marginVertical: ui.spaceSection,
    alignSelf: 'stretch',
  },
  emptyText: {
    fontSize: 15,
    color: ui.textSubtle,
    lineHeight: 22,
  },
  emptyBlock: {},
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.textPrimary,
    lineHeight: 22,
  },
  emptySubline: {
    marginTop: 6,
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
  offersReceived: {
    fontSize: 13,
    color: ui.textPrimary,
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
    color: ui.primaryOn,
    fontSize: 16,
    fontWeight: '600',
  },
  deleteAction: {
    backgroundColor: '#E53935',
    justifyContent: 'center',
    alignItems: 'center',
    width: 88,
    borderTopRightRadius: ui.radiusCard,
    borderBottomRightRadius: ui.radiusCard,
  },
  deleteActionText: {
    color: ui.primaryOn,
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
    fontWeight: '800',
    color: ui.textPrimary,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  activeBlockSpacer: {
    height: 16,
  },
  activeWithLine: {
    fontSize: 15,
    color: ui.textPrimary,
    textAlign: 'center',
    alignSelf: 'stretch',
    lineHeight: 22,
  },
  activeStartLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  activeStartValue: {
    fontSize: 15,
    color: ui.textPrimary,
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
  },
  activeStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2E7D32',
  },
  activeStatusLabel: {
    marginLeft: 8,
    fontSize: 15,
    fontWeight: '700',
    color: '#1B5E20',
  },
  activeBetweenCardSpacer: {
    height: ui.spaceSection,
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
    paddingHorizontal: ui.padScreenH,
    borderRadius: ui.radiusButton,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.primary,
    ...shadowKey,
  },
  activeBtnPressed: {
    ...primarySolidPressed,
  },
  activeBtnPrimaryLargeText: {
    fontSize: 17,
    fontWeight: '700',
    color: ui.primaryOn,
  },
  listingCard: {
    ...cardChrome,
    marginBottom: ui.spaceSm + 4,
  },
  listingCardPressed: {
    backgroundColor: ui.surfaceStriped,
  },
  listingTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: ui.textPrimary,
    marginBottom: 6,
    lineHeight: 22,
  },
  listingMeta: {
    fontSize: ui.fontPrice,
    fontWeight: '600',
    color: ui.textPrimary,
    marginBottom: 4,
  },
  listingDistance: {
    fontSize: 14,
    fontWeight: '500',
    color: ui.textSecondary,
    marginBottom: 4,
  },
  listingDesc: {
    fontSize: 14,
    color: ui.textSecondary,
  },
});
