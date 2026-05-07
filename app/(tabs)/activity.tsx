import { CardPressable } from '@/components/CardPressable';
import { MainTabFab, useMainTabFabBottomReserve } from '@/components/MainTabFab';
import { Pressable } from '@/components/Pressable';
import {
  RequestListCardInner,
  requestListCardSurface,
} from '@/components/RequestListCardInner';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import {
  cardChrome,
  primarySolidPressed,
  shadowKey,
  shadowSegmentActive,
  shadowSegmentAttention,
  ui,
} from '@/constants/appUi';
import {
  activityRequestInvolvesUser,
  getRequestOwnerId,
  offerCountsForActivityRow,
} from '@/lib/activityScope';
import { useAuthUserId } from '@/lib/authUser';
import {
  fetchPendingRentalRequestsForOwner,
  type PendingListingRentalRow,
} from '@/lib/fetchPendingRentalRequestsForOwner';
import {
  fetchUnifiedRentalsForUser,
  unifiedRentalTitle,
  type UnifiedRentalRow,
} from '@/lib/fetchUnifiedRentalsForUser';
import { markAllNonMessageNotificationsAsRead } from '@/lib/markNotificationsRead';
import { formatUsd, getNumericOfferPrice } from '@/lib/money';
import { formatMilesShort } from '@/lib/requestDistance';
import { getRequestSupabaseRowId } from '@/lib/requestOwnership';
import { getSupabase } from '@/lib/supabase';
import { refreshActivityScreenFromSupabase } from '@/lib/supabaseActivityRefresh';
import { updateRentalRequestStatus } from '@/lib/updateRentalRequestStatus';
import { useMessageUnreadStore, useUnreadMessagesTotal } from '@/store/messageUnreadStore';
import { formatListingPriceWithUnit, useListingsStore } from '@/store/listingsStore';
import type { AppNotification } from '@/store/notificationsStore';
import { useNotificationsStore } from '@/store/notificationsStore';
import type { Offer } from '@/store/offersStore';
import { removeOffersForRequest, useOffersStore } from '@/store/offersStore';
import {
  getEffectiveRentalStatus,
  removeRequest,
  resolveRequestFromRouteId,
  useRequestsStore,
} from '@/store/requestsStore';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

declare const __DEV__: boolean;

function formatOffersReceived(n: number): string {
  if (n === 1) return '1 offer received';
  return `${n} offers received`;
}

function visibleUnreadForUser(n: AppNotification, userId: string): boolean {
  return !n.read && (n.forUserId == null || n.forUserId === '' || n.forUserId === userId);
}

function formatSectionCount(n: number): string {
  if (n <= 0) return '';
  return n > 99 ? '99+' : String(n);
}

function rentalsSubTabBadgeCount(n: number): string {
  return n > 99 ? '99+' : String(Math.max(0, n));
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

function listingRentalDurationLabel(durationType: string): string {
  switch (durationType) {
    case 'half':
      return 'Half day';
    case 'full':
      return 'Full day';
    case 'week':
      return 'Weekly';
    default:
      return durationType;
  }
}

function pendingListingTitle(row: PendingListingRentalRow): string {
  const t = row.listings?.title;
  const name = typeof t === 'string' ? t.trim() : '';
  return name || row.listing_id;
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

/** Rentals tab: borrower vs equipment-owner segments (`rentals` table). */
type RentalsSubView = 'renting' | 'listing';

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

function rentalStatusVisual(
  row: UnifiedRentalRow,
  role: RentalsSubView
): { label: string } {
  const nowMs = Date.now();
  const pickupMs = row.pickup_datetime ? new Date(row.pickup_datetime).getTime() : null;
  const returnMs = row.return_datetime ? new Date(row.return_datetime).getTime() : null;
  const status = String(row.status ?? '')
    .trim()
    .toLowerCase();
  const agreementStatus = String(row.agreement_status ?? '')
    .trim()
    .toLowerCase();
  const allConfirmed = row.owner_confirmed === true && row.renter_confirmed === true;

  if (status === 'completed' || status === 'returned') {
    return { label: 'Completed' };
  }
  if (status === 'cancelled' || status === 'canceled') {
    return { label: 'Awaiting confirmation' };
  }
  if (agreementStatus === 'pending' || !allConfirmed) {
    return { label: 'Awaiting confirmation' };
  }
  if (status === 'active') {
    if (returnMs != null) {
      const dayMs = 24 * 60 * 60 * 1000;
      const diff = returnMs - nowMs;
      if (diff > 0 && diff <= dayMs) {
        return { label: 'Return scheduled' };
      }
      if (diff <= 0) {
        return { label: 'Awaiting return' };
      }
    }
    return { label: 'Rental active' };
  }
  if (pickupMs != null) {
    const withinMeetupWindow = Math.abs(pickupMs - nowMs) <= 6 * 60 * 60 * 1000;
    if (withinMeetupWindow || nowMs > pickupMs) {
      return { label: 'Meetup scheduled' };
    }
    return { label: 'Ready for pickup' };
  }

  return {
    label: role === 'listing' ? 'Meetup scheduled' : 'Ready for pickup',
  };
}

export default function ActivityScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<ActivityTab>('requests');
  const [rentalsSubView, setRentalsSubView] = useState<RentalsSubView>('renting');
  const me = useAuthUserId();
  const listings = useListingsStore((s) => s.listings);
  const offers = useOffersStore((state) => state.offers);
  const notifications = useNotificationsStore((s) => s.notifications);
  const unreadCount = useUnreadMessagesTotal();
  const unreadByOfferId = useMessageUnreadStore((s) => s.unreadByOfferId);
  if (__DEV__) {
    console.log('[Activity] render unread messages total', unreadCount);
  }
  const hasUnreadMessages = unreadCount > 0;
  const requests = useRequestsStore((s) => s.requests);
  const [pendingListingRentals, setPendingListingRentals] = useState<PendingListingRentalRow[]>([]);
  const [unifiedRentals, setUnifiedRentals] = useState<UnifiedRentalRow[]>([]);
  const [busyRentalRequestId, setBusyRentalRequestId] = useState<string | null>(null);

  const refreshListingRentalRequests = useCallback(async () => {
    const uid = me.trim();
    if (!uid) {
      setPendingListingRentals([]);
      return;
    }
    const pending = await fetchPendingRentalRequestsForOwner(uid);
    setPendingListingRentals(pending);
  }, [me]);

  const refreshUnifiedRentals = useCallback(async () => {
    const uid = me.trim();
    if (!uid) {
      setUnifiedRentals([]);
      return;
    }
    const rows = await fetchUnifiedRentalsForUser(uid);
    setUnifiedRentals(rows);
  }, [me]);

  const refreshListingRentalRequestsRef = useRef(refreshListingRentalRequests);
  refreshListingRentalRequestsRef.current = refreshListingRentalRequests;

  const refreshUnifiedRentalsRef = useRef(refreshUnifiedRentals);
  refreshUnifiedRentalsRef.current = refreshUnifiedRentals;

  useFocusEffect(
    useCallback(() => {
      // Request + offer data only. Notifications list comes from `notificationsStore` (realtime + initial fetch), not a refetch here.
      void refreshActivityScreenFromSupabase();
      markAllNonMessageNotificationsAsRead();
      void refreshListingRentalRequests();
      void refreshUnifiedRentals();
    }, [refreshListingRentalRequests, refreshUnifiedRentals])
  );

  useEffect(() => {
    const uid = me.trim();
    if (!uid) return;
    const supabase = getSupabase();
    const channelId =
      typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const channel = supabase.channel(`activity_rental_requests:${uid}:${channelId}`);
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'rental_requests' },
      () => void refreshListingRentalRequestsRef.current()
    );
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [me]);

  useEffect(() => {
    const uid = me.trim();
    if (!uid) return;
    const supabase = getSupabase();
    const channelId =
      typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const channel = supabase.channel(`activity_unified_rentals:${uid}:${channelId}`);
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'rentals' },
      () => void refreshUnifiedRentalsRef.current()
    );
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [me]);

  const onApproveListingRental = useCallback(
    async (id: string) => {
      setBusyRentalRequestId(id);
      const res = await updateRentalRequestStatus(id, 'approved');
      if (!res.ok) {
        alert(res.error ?? 'Could not approve');
        setBusyRentalRequestId(null);
        return;
      }
      await refreshActivityScreenFromSupabase();
      router.back();
      await refreshListingRentalRequests();
      await refreshUnifiedRentals();
      setBusyRentalRequestId(null);
    },
    [refreshListingRentalRequests, refreshUnifiedRentals]
  );

  const onDeclineListingRental = useCallback(
    async (id: string) => {
      setBusyRentalRequestId(id);
      const res = await updateRentalRequestStatus(id, 'declined');
      if (!res.ok) {
        alert(res.error ?? 'Could not decline');
        setBusyRentalRequestId(null);
        return;
      }
      await refreshListingRentalRequests();
      setBusyRentalRequestId(null);
    },
    [refreshListingRentalRequests]
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

  const approvedAsRenter = useMemo(
    () => unifiedRentals.filter((r) => r.renter_user_id === me),
    [unifiedRentals, me]
  );

  const approvedAsOwner = useMemo(
    () => unifiedRentals.filter((r) => r.owner_user_id === me),
    [unifiedRentals, me]
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

  const rentalsTotalCount = unifiedRentals.length;

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

  /** Unified `rentals` rows (Activity → Rentals tab). */
  const rentalsActivityCount = unifiedRentals.length;

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
                    pathname: '/request',
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

  function renderRentalOperationalRow(row: UnifiedRentalRow, role: RentalsSubView) {
    const title = unifiedRentalTitle(row);
    const priceNum = Number(row.price);
    const priceLabel = Number.isFinite(priceNum) ? formatUsd(priceNum) : '—';
    const messageUnread =
      typeof row.offer_id === 'string' && row.offer_id.trim() !== ''
        ? (unreadByOfferId[row.offer_id.trim()] ?? 0)
        : 0;
    const status = rentalStatusVisual(row, role);

    return (
      <View key={row.id} style={styles.rentalRowCard}>
        <View style={styles.rentalRowMain}>
          <View style={styles.rentalRowTop}>
            <Text style={styles.rentalRowTitle} numberOfLines={1}>
              {title}
            </Text>
            <View style={styles.rentalRowActions}>
              <Pressable
                pressOpacityFeedback={false}
                haptic
                onPress={() => {
                  if (!row.id) {
                    console.warn('Missing rental id');
                    return;
                  }
                  router.push({
                    pathname: '/chat/[id]',
                    params: { id: row.id },
                  });
                }}
                style={({ pressed }) => [styles.rentalIconBtn, pressed && styles.rentalIconBtnPressed]}
                accessibilityRole="button"
                accessibilityLabel="Message"
              >
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={ui.textSecondary} />
                {messageUnread > 0 ? (
                  <View style={styles.rentalIconBadge}>
                    <Text style={styles.rentalIconBadgeText}>{formatSectionCount(messageUnread)}</Text>
                  </View>
                ) : null}
              </Pressable>
              <Pressable
                pressOpacityFeedback={false}
                haptic
                onPress={() => {
                  router.push({
                    pathname: '/rental/[id]',
                    params: { id: row.id },
                  });
                }}
                style={({ pressed }) => [styles.rentalIconBtn, pressed && styles.rentalIconBtnPressed]}
                accessibilityRole="button"
                accessibilityLabel="View details"
              >
                <Ionicons name="document-text-outline" size={18} color={ui.textSecondary} />
              </Pressable>
            </View>
          </View>
          <View style={styles.rentalStatusRow}>
            <View style={styles.rentalStatusChip}>
              <Text style={styles.rentalStatusChipText}>{`Status: ${status.label}`}</Text>
            </View>
          </View>
          <Text style={styles.rentalRowMeta} numberOfLines={1}>
            {priceLabel}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScreenWrapper style={styles.screenWrap}>
      <View style={styles.screen}>
        <ScreenEntrance style={styles.screenInner}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: fabBottomReserve }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces
          >
            <View style={[styles.header, { paddingTop: 12 }]}>
              <View style={styles.headerTitleRow}>
                <Text style={styles.screenTitle} numberOfLines={1}>
                  Activity
                </Text>
                <Pressable
                  pressOpacityFeedback={false}
                  haptic
                  onPress={goToChats}
                  style={({ pressed }) => [
                    styles.messagesPill,
                    pressed && styles.messagesPillPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={hasUnreadMessages ? `Messages, ${unreadCount} unread` : 'Messages'}
                >
                  <Text style={styles.messagesPillLabel}>Messages</Text>
                  {hasUnreadMessages ? (
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
                    tab !== 'rentals' && rentalsActivityCount > 0 && styles.tabCellMutedAttention,
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
              {pendingListingRentals.length > 0 ? (
                <>
                  <Text style={styles.activePastHeading}>Pending listing rentals</Text>
                  <Text style={styles.pendingListingSubtext}>
                    Someone requested to rent your equipment · approve or decline
                  </Text>
                  {pendingListingRentals.map((row) => {
                    const title = pendingListingTitle(row);
                    const priceNum = Number(row.price);
                    const priceLabel = Number.isFinite(priceNum) ? formatUsd(priceNum) : '—';
                    const duration = listingRentalDurationLabel(row.duration_type);
                    const busy = busyRentalRequestId === row.id;
                    return (
                      <View key={row.id} style={styles.pendingListingRentalCard}>
                        <Text style={styles.matchedRentalTitle} numberOfLines={2}>
                          {title}
                        </Text>
                        <Text style={styles.matchedRentalHint}>{priceLabel}</Text>
                        <Text style={styles.matchedRentalHint}>{duration}</Text>
                        <View style={styles.pendingRentalBtnRow}>
                          <Pressable
                            disabled={busy}
                            pressOpacityFeedback={false}
                            haptic
                            style={({ pressed }) => [
                              styles.pendingRentalBtn,
                              styles.pendingRentalBtnApprove,
                              busy && styles.pendingRentalBtnDisabled,
                              pressed && !busy && styles.pendingRentalBtnApprovePressed,
                            ]}
                            onPress={() => void onApproveListingRental(row.id)}
                            accessibilityRole="button"
                            accessibilityLabel={`Approve rental request for ${title}`}
                          >
                            <Text style={styles.pendingRentalBtnApproveText}>Approve</Text>
                          </Pressable>
                          <Pressable
                            disabled={busy}
                            pressOpacityFeedback={false}
                            haptic
                            style={({ pressed }) => [
                              styles.pendingRentalBtn,
                              styles.pendingRentalBtnDecline,
                              busy && styles.pendingRentalBtnDisabled,
                              pressed && !busy && styles.pendingRentalBtnDeclinePressed,
                            ]}
                            onPress={() => void onDeclineListingRental(row.id)}
                            accessibilityRole="button"
                            accessibilityLabel={`Decline rental request for ${title}`}
                          >
                            <Text style={styles.pendingRentalBtnDeclineText}>Decline</Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                  <View style={[styles.sectionRule, styles.sectionRuleTight]} />
                </>
              ) : null}
              {activeRequestsSorted.length === 0 && pastRequestsSorted.length === 0 ? (
                pendingListingRentals.length === 0 ? (
                  <Text style={styles.emptyText}>No requests yet. Tap + to request equipment.</Text>
                ) : null
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
                rentalsActivityCount > 0 && styles.tabPanelAttention,
              ]}
            >
              <Text style={styles.tabPanelSubline}>
                Active agreements from requests and listings (your unified rentals)
              </Text>
              {unifiedRentals.length === 0 ? (
                <View style={styles.emptyBlock}>
                  <Text style={styles.emptyTitle}>No rentals yet</Text>
                  <Text style={styles.emptySubline}>
                    When an agreement is finalized, it appears here under Currently renting or Renting
                    out.
                  </Text>
                </View>
              ) : (
                <>
                  <View style={styles.rentalsSubTabRow}>
                    <Pressable
                      onPress={() => setRentalsSubView('renting')}
                      style={({ pressed }) => [
                        styles.rentalsSubTabCell,
                        rentalsSubView === 'renting'
                          ? styles.tabCellActive
                          : styles.tabCellInactive,
                        pressed && styles.tabPressed,
                      ]}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: rentalsSubView === 'renting' }}
                      accessibilityLabel={`Currently renting, ${approvedAsRenter.length} rentals`}
                    >
                      <Text
                        style={[
                          styles.rentalsSubTabLabel,
                          rentalsSubView === 'renting' && styles.tabLabelActive,
                        ]}
                        numberOfLines={2}
                      >
                        Currently renting
                      </Text>
                      <View style={rentalsSubView === 'renting' ? styles.tabBadge : styles.tabBadgeMuted}>
                        <Text
                          style={
                            rentalsSubView === 'renting'
                              ? styles.tabBadgeText
                              : styles.tabBadgeMutedText
                          }
                        >
                          {rentalsSubTabBadgeCount(approvedAsRenter.length)}
                        </Text>
                      </View>
                    </Pressable>
                    <Pressable
                      onPress={() => setRentalsSubView('listing')}
                      style={({ pressed }) => [
                        styles.rentalsSubTabCell,
                        rentalsSubView === 'listing'
                          ? styles.tabCellActive
                          : styles.tabCellInactive,
                        pressed && styles.tabPressed,
                      ]}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: rentalsSubView === 'listing' }}
                      accessibilityLabel={`Renting out, ${approvedAsOwner.length} matches`}
                    >
                      <Text
                        style={[
                          styles.rentalsSubTabLabel,
                          rentalsSubView === 'listing' && styles.tabLabelActive,
                        ]}
                        numberOfLines={2}
                      >
                        Renting out
                      </Text>
                      <View style={rentalsSubView === 'listing' ? styles.tabBadge : styles.tabBadgeMuted}>
                        <Text
                          style={
                            rentalsSubView === 'listing'
                              ? styles.tabBadgeText
                              : styles.tabBadgeMutedText
                          }
                        >
                          {rentalsSubTabBadgeCount(approvedAsOwner.length)}
                        </Text>
                      </View>
                    </Pressable>
                  </View>

                  {rentalsSubView === 'renting' ? (
                    approvedAsRenter.length === 0 ? (
                      <View style={styles.emptyBlock}>
                        <Text style={styles.emptyTitle}>Nothing here yet</Text>
                        <Text style={styles.emptySubline}>
                          Rentals where you're the borrower appear here (requests or listings).
                        </Text>
                      </View>
                    ) : (
                      <>
                        <Text style={styles.activePastHeading}>You are renting</Text>
                        {approvedAsRenter.map((row) => renderRentalOperationalRow(row, 'renting'))}
                      </>
                    )
                  ) : approvedAsOwner.length === 0 ? (
                    <View style={styles.emptyBlock}>
                      <Text style={styles.emptyTitle}>Nothing here yet</Text>
                      <Text style={styles.emptySubline}>
                        Rentals where you're lending equipment appear here.
                      </Text>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.activePastHeading}>You are renting out</Text>
                      {approvedAsOwner.map((row) => renderRentalOperationalRow(row, 'listing'))}
                    </>
                  )}
                </>
              )}
            </View>
          ) : null}
          </ScrollView>

          <MainTabFab />
        </ScreenEntrance>
      </View>
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
  screenInner: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 0,
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
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#0B1F3A',
  },
  messagesPillPressed: {
    opacity: 0.9,
  },
  messagesPillLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  messagesPillBadge: {
    position: 'absolute',
    top: -3,
    right: 2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: '#D7263D',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  messagesPillBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginTop: ui.spaceMd,
  },
  rentalsSubTabRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginBottom: ui.spaceMd,
  },
  rentalsSubTabCell: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 12,
    minHeight: 56,
  },
  rentalsSubTabLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: ui.textSecondary,
    letterSpacing: -0.1,
    textAlign: 'center',
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
  pendingListingSubtext: {
    fontSize: 13,
    color: ui.textSecondary,
    lineHeight: 18,
    marginBottom: 12,
    marginTop: -4,
  },
  pendingListingRentalCard: {
    ...cardChrome,
    marginBottom: 12,
    paddingVertical: 14,
    paddingHorizontal: ui.padCard,
  },
  pendingRentalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  pendingRentalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: ui.radiusButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingRentalBtnApprove: {
    backgroundColor: ui.primary,
  },
  pendingRentalBtnApprovePressed: {
    backgroundColor: ui.primaryPressed,
  },
  pendingRentalBtnApproveText: {
    color: ui.primaryOn,
    fontSize: 15,
    fontWeight: '700',
  },
  pendingRentalBtnDecline: {
    backgroundColor: ui.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.danger,
  },
  pendingRentalBtnDeclinePressed: {
    backgroundColor: '#FFEBEE',
  },
  pendingRentalBtnDeclineText: {
    color: ui.danger,
    fontSize: 15,
    fontWeight: '700',
  },
  pendingRentalBtnDisabled: {
    opacity: 0.55,
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
  rentalRowCard: {
    ...cardChrome,
    marginBottom: 7,
    paddingVertical: 9,
    paddingHorizontal: ui.padCard,
  },
  rentalRowMain: {
    width: '100%',
  },
  rentalRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  rentalRowTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: '700',
    color: ui.textPrimary,
  },
  rentalRowMeta: {
    marginTop: 3,
    fontSize: 12,
    color: ui.textSecondary,
  },
  rentalStatusRow: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rentalStatusChip: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 1,
    backgroundColor: '#0B1F3A',
  },
  rentalStatusChipText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.05,
    color: '#FFFFFF',
  },
  rentalRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rentalIconBtn: {
    position: 'relative',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F7FD',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D6E0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rentalIconBtnPressed: {
    opacity: 0.86,
  },
  rentalIconBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D7263D',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  rentalIconBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  pastRentalCard: {
    opacity: 0.92,
    backgroundColor: ui.surfaceStriped,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 0,
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
    position: 'relative',
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
  threadMessageBtnBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D7263D',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  threadMessageBtnBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
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
