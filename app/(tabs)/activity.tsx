import { RootScreenHeader } from '@/components/AppHeaders';
import { Image } from 'expo-image';
import { CardPressable } from '@/components/CardPressable';
import { MainTabFab, useMainTabFabBottomReserve } from '@/components/MainTabFab';
import { Pressable } from '@/components/Pressable';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { shadowCard, ui } from '@/constants/appUi';
import {
  activityRequestInvolvesUser,
  getRequestOwnerId,
} from '@/lib/activityScope';
import { isRequestExpired } from '@/lib/requestCardStatus';
import { useAuthUserId } from '@/lib/authUser';
import {
  fetchPendingRentalRequestsForOwner,
  type PendingListingRentalRow,
} from '@/lib/fetchPendingRentalRequestsForOwner';
import {
  activityRentalsIntentPendingSyncRef,
  readAndClearActivityPendingIntent,
} from '@/lib/activityPendingIntent';
import { formatUsd } from '@/lib/money';
import { getSupabase } from '@/lib/supabase';
import { hydrateListingsFromSupabase } from '@/lib/hydrateListingsFromSupabase';
import { hydrateListingOffersFromSupabase } from '@/lib/hydrateListingOffersFromSupabase';
import { refreshActivityScreenFromSupabase } from '@/lib/supabaseActivityRefresh';
import { mergeRecentNotificationsFromServer } from '@/lib/notificationsServerSync';
import { markAllNonMessageNotificationsAsRead } from '@/lib/markNotificationsRead';
import { hydrateListingAvailability, useListingAvailabilityStore } from '@/store/listingAvailabilityStore';
import { formatListingPriceWithUnit, useListingsStore } from '@/store/listingsStore';
import { useListingOffersActivityStore } from '@/store/listingOffersActivityStore';
import { usePendingRentalRequestsActivityStore } from '@/store/pendingRentalRequestsActivityStore';
import { useUnreadMessagesTotal } from '@/store/messageUnreadStore';
import {
  getEffectiveRentalStatus,
  isOwnerRequestHiddenFromActivity,
  useRequestsStore,
} from '@/store/requestsStore';
import { useUnifiedRentalsActivityStore } from '@/store/unifiedRentalsActivityStore';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

function formatSectionCount(n: number): string {
  if (n <= 0) return '';
  return n > 99 ? '99+' : String(n);
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

/** Extra scroll padding on Activity so the FAB clears the last card (FAB sits bottom-right). */
const ACTIVITY_FAB_EXTRA_BOTTOM = 44;

export default function ActivityScreen() {
  const router = useRouter();
  const me = useAuthUserId();
  const fabBottomReserve = useMainTabFabBottomReserve();
  const listings = useListingsStore((s) => s.listings);
  const requests = useRequestsStore((s) => s.requests);
  const listingOfferRows = useListingOffersActivityStore((s) => s.rows);
  const unreadCount = useUnreadMessagesTotal();
  const hasUnreadMessages = unreadCount > 0;
  const availabilityByListing = useListingAvailabilityStore((s) => s.byListingId);

  const [pendingListingRentals, setPendingListingRentals] = useState<PendingListingRentalRow[]>([]);
  const unifiedRentals = useUnifiedRentalsActivityStore((s) => s.rows);
  const refreshUnifiedRentals = useUnifiedRentalsActivityStore((s) => s.refreshFromServer);

  const refreshListingRentalRequests = useCallback(async () => {
    const uid = me.trim();
    if (!uid) {
      setPendingListingRentals([]);
      return;
    }
    const pending = await fetchPendingRentalRequestsForOwner(uid);
    setPendingListingRentals(pending);
  }, [me]);

  const refreshListingRentalRequestsRef = useRef(refreshListingRentalRequests);
  refreshListingRentalRequestsRef.current = refreshListingRentalRequests;

  const hydrateListingOffersRef = useRef(hydrateListingOffersFromSupabase);
  hydrateListingOffersRef.current = hydrateListingOffersFromSupabase;

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
    const channel = supabase.channel(`activity_listing_offers:${uid}:${channelId}`);
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'offers' },
      () => void hydrateListingOffersRef.current()
    );
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [me]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        try {
          const intent = await readAndClearActivityPendingIntent();
          if (cancelled || intent == null) return;
          if (intent.scrollTo === 'owner_rentals') {
            router.push('/activity-my-shop');
          } else {
            router.push('/activity-renting');
          }
        } finally {
          activityRentalsIntentPendingSyncRef.current = false;
        }
      })();
      void refreshActivityScreenFromSupabase();
      markAllNonMessageNotificationsAsRead();
      void mergeRecentNotificationsFromServer();
      void refreshListingRentalRequests();
      void usePendingRentalRequestsActivityStore.getState().refreshFromServer(me.trim());
      void refreshUnifiedRentals();
      void hydrateListingsFromSupabase();
      return () => {
        cancelled = true;
        activityRentalsIntentPendingSyncRef.current = false;
      };
    }, [refreshListingRentalRequests, refreshUnifiedRentals, router])
  );

  const myEquipment = useMemo(
    () =>
      listings.filter(
        (l) => l.ownerUserId != null && l.ownerUserId !== '' && l.ownerUserId === me
      ),
    [listings, me]
  );

  useFocusEffect(
    useCallback(() => {
      void Promise.all(myEquipment.map((l) => hydrateListingAvailability(l.id)));
    }, [myEquipment])
  );

  const shopBlockedAvailabilityCount = useMemo(() => {
    let n = 0;
    for (const l of myEquipment) {
      const rows = availabilityByListing[l.id] ?? [];
      n += rows.filter((r) => r.availabilityType === 'blocked').length;
    }
    return n;
  }, [myEquipment, availabilityByListing]);

  const activityRequests = useMemo(
    () => requests.filter((r) => activityRequestInvolvesUser(r as Record<string, unknown>, me)),
    [requests, me]
  );
  const sortedActivityPool = useMemo(
    () => [...activityRequests].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0)),
    [activityRequests]
  );
  const ownedRequestsSorted = useMemo(
    () =>
      sortedActivityPool.filter(
        (r) =>
          getRequestOwnerId(r as Record<string, unknown>) === me &&
          !isOwnerRequestHiddenFromActivity(r)
      ),
    [sortedActivityPool, me]
  );

  const activeTabRequestsPool = useMemo(
    () =>
      [...ownedRequestsSorted].filter((r) => {
        const life = getEffectiveRentalStatus(r);
        if (life === 'completed') return false;
        if (life === 'pending' && isRequestExpired(r)) return false;
        return true;
      }),
    [ownedRequestsSorted]
  );

  const approvedAsRenter = useMemo(
    () => unifiedRentals.filter((r) => r.renter_user_id === me),
    [unifiedRentals, me]
  );

  const renterUpcomingRentalsCount = useMemo(() => {
    let n = 0;
    for (const r of approvedAsRenter) {
      const s = String(r.status ?? '').trim().toLowerCase();
      if (s === 'completed' || s === 'returned' || s === 'cancelled' || s === 'canceled') continue;
      n += 1;
    }
    return n;
  }, [approvedAsRenter]);

  const renterCompletedRentalsCount = useMemo(() => {
    let n = 0;
    for (const r of approvedAsRenter) {
      const s = String(r.status ?? '').trim().toLowerCase();
      if (s === 'completed' || s === 'returned') n += 1;
    }
    return n;
  }, [approvedAsRenter]);

  const listingOffersAsOwner = useMemo(
    () =>
      listingOfferRows
        .filter((o) => o.listingOwnerUserId === me)
        .sort((a, b) => b.updatedAtMs - a.updatedAtMs),
    [listingOfferRows, me]
  );
  const listingOffersAsRenter = useMemo(
    () =>
      listingOfferRows
        .filter((o) => o.renterUserId === me)
        .sort((a, b) => b.updatedAtMs - a.updatedAtMs),
    [listingOfferRows, me]
  );

  const activeOutgoingListingOffersCount = useMemo(() => {
    let n = 0;
    for (const o of listingOffersAsRenter) {
      if (o.status === 'declined' || o.status === 'closed' || o.status === 'accepted') continue;
      n += 1;
    }
    return n;
  }, [listingOffersAsRenter]);

  const shopIncomingActionableOffers = useMemo(
    () =>
      listingOffersAsOwner.filter(
        (o) => o.status === 'pending' || o.status === 'pending_confirmation'
      ),
    [listingOffersAsOwner]
  );

  const needsAttentionTotal = pendingListingRentals.length + shopIncomingActionableOffers.length;

  const needsAttentionPrimary = useMemo(() => {
    if (pendingListingRentals.length > 0) {
      const row = pendingListingRentals[0]!;
      return {
        kind: 'listing_booking' as const,
        title: pendingListingTitle(row),
        meta: `${Number.isFinite(Number(row.price)) ? formatUsd(Number(row.price)) : '—'} · ${listingRentalDurationLabel(row.duration_type)}`,
        hero: row.listing_snapshot?.hero_image_url?.trim() ?? null,
        rentalRequestId: row.id,
      };
    }
    const offer = shopIncomingActionableOffers[0];
    if (offer) {
      const title = offer.snapshot?.title ?? 'Listing';
      const hero = offer.snapshot?.hero_image_url?.trim();
      return {
        kind: 'listing_offer' as const,
        title,
        meta: `${formatUsd(offer.currentPrice)} · ${getTimeAgo(offer.updatedAtMs)}`,
        hero: hero && hero.length > 0 ? hero : null,
        offerId: offer.id,
      };
    }
    return null;
  }, [pendingListingRentals, shopIncomingActionableOffers]);

  const openListingOfferDetail = useCallback(
    (offerId: string) => {
      router.push({ pathname: '/listing-offer-detail', params: { offerId } });
    },
    [router]
  );

  const goToChats = useCallback(() => {
    router.push('/(tabs)/chats');
  }, [router]);

  return (
    <ScreenWrapper style={styles.screenWrap}>
      <View style={styles.screen}>
        <ScreenEntrance style={styles.screenInner}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: fabBottomReserve + ACTIVITY_FAB_EXTRA_BOTTOM },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces
          >
            <View style={styles.header}>
              <RootScreenHeader
                title="Activity"
                subtitle="Your rentals and your shop, organized in one place."
                style={styles.headerTitleBlock}
                rightAccessory={
                  <Pressable
                    pressOpacityFeedback={false}
                    haptic
                    onPress={goToChats}
                    style={({ pressed }) => [styles.messagesPill, pressed && styles.messagesPillPressed]}
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
                }
              />
            </View>

            {needsAttentionTotal > 0 && needsAttentionPrimary ? (
              <View style={styles.needsAttentionWrap}>
                <Text style={styles.needsAttentionLabel}>Needs attention</Text>
                <CardPressable
                  onPress={() => {
                    if (needsAttentionPrimary.kind === 'listing_offer' && needsAttentionPrimary.offerId) {
                      openListingOfferDetail(needsAttentionPrimary.offerId);
                      return;
                    }
                    if (needsAttentionPrimary.kind === 'listing_booking') {
                      router.push({
                        pathname: '/activity-my-shop',
                        params: {
                          section: 'inbox',
                          ...(needsAttentionPrimary.rentalRequestId
                            ? { rentalRequestId: needsAttentionPrimary.rentalRequestId }
                            : {}),
                        },
                      });
                      return;
                    }
                    router.push('/activity-my-shop');
                  }}
                  style={({ pressed }) => [styles.needsAttentionCard, pressed && styles.needsAttentionCardPressed]}
                >
                  <View style={styles.needsAttentionRow}>
                    {needsAttentionPrimary.hero ? (
                      <Image
                        source={{ uri: needsAttentionPrimary.hero }}
                        style={styles.needsAttentionThumb}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={[styles.needsAttentionThumb, styles.needsAttentionThumbPh]} />
                    )}
                    <View style={styles.needsAttentionMid}>
                      <Text style={styles.needsAttentionEyebrow}>
                        {needsAttentionPrimary.kind === 'listing_booking'
                          ? 'Listing booking'
                          : 'Incoming offer'}
                      </Text>
                      <Text style={styles.needsAttentionTitle} numberOfLines={1}>
                        {needsAttentionPrimary.title}
                      </Text>
                      <Text style={styles.needsAttentionMeta} numberOfLines={1}>
                        {needsAttentionPrimary.meta}
                      </Text>
                    </View>
                    <View style={styles.needsAttentionRight}>
                      {needsAttentionTotal > 1 ? (
                        <View style={styles.needsAttentionCountBadge}>
                          <Text style={styles.needsAttentionCountText}>
                            {needsAttentionTotal > 99 ? '99+' : String(needsAttentionTotal)}
                          </Text>
                        </View>
                      ) : null}
                      <Ionicons name="chevron-forward" size={18} color={ui.textSecondary} />
                    </View>
                  </View>
                </CardPressable>
              </View>
            ) : null}

            <View style={styles.commandRow}>
              <View style={[styles.commandModule, styles.commandModuleRenting]}>
                <View style={styles.commandModuleHeader}>
                  <Ionicons name="calendar-outline" size={20} color={ui.primary} />
                  <Text style={styles.commandModuleTitle}>Renting</Text>
                </View>
                <Text style={styles.commandModuleSub}>Things you are renting or trying to rent.</Text>
                <View style={styles.commandStatList}>
                  <View style={styles.commandStatRow}>
                    <Text style={styles.commandStatLabel}>Upcoming rentals</Text>
                    <Text style={styles.commandStatValue}>{formatSectionCount(renterUpcomingRentalsCount)}</Text>
                  </View>
                  <View style={styles.commandStatRow}>
                    <Text style={styles.commandStatLabel}>Listing offers you sent</Text>
                    <Text style={styles.commandStatValue}>
                      {formatSectionCount(activeOutgoingListingOffersCount)}
                    </Text>
                  </View>
                  <View style={styles.commandStatRow}>
                    <Text style={styles.commandStatLabel}>Borrow requests</Text>
                    <Text style={styles.commandStatValue}>{formatSectionCount(activeTabRequestsPool.length)}</Text>
                  </View>
                  <View style={styles.commandStatRow}>
                    <Text style={styles.commandStatLabel}>Rental history</Text>
                    <Text style={styles.commandStatValue}>{formatSectionCount(renterCompletedRentalsCount)}</Text>
                  </View>
                </View>
                <Pressable
                  pressOpacityFeedback={false}
                  haptic
                  onPress={() => router.push('/activity-renting')}
                  style={({ pressed }) => [styles.commandCta, pressed && styles.commandCtaPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Open renting workspace"
                >
                  <Text style={styles.commandCtaLabel}>Open Renting</Text>
                </Pressable>
              </View>

              <View style={[styles.commandModule, styles.commandModuleShop]}>
                <View style={styles.commandModuleHeader}>
                  <Ionicons name="storefront-outline" size={20} color={ui.primary} />
                  <Text style={styles.commandModuleTitle}>My shop</Text>
                </View>
                <Text style={styles.commandModuleSub}>Manage your listings, offers, and rentals.</Text>
                <View style={styles.commandStatList}>
                  <View style={styles.commandStatRow}>
                    <Text style={styles.commandStatLabel}>Incoming offers</Text>
                    <Text style={styles.commandStatValue}>
                      {formatSectionCount(shopIncomingActionableOffers.length)}
                    </Text>
                  </View>
                  <View style={styles.commandStatRow}>
                    <Text style={styles.commandStatLabel}>Availability</Text>
                    <Text style={styles.commandStatValueMuted}>
                      {shopBlockedAvailabilityCount > 0
                        ? `${shopBlockedAvailabilityCount} blocked`
                        : 'None blocked'}
                    </Text>
                  </View>
                  <View style={styles.commandStatRow}>
                    <Text style={styles.commandStatLabel}>My listings</Text>
                    <Text style={styles.commandStatValue}>{formatSectionCount(myEquipment.length)}</Text>
                  </View>
                  <View style={styles.commandStatRow}>
                    <Text style={styles.commandStatLabel}>Earnings</Text>
                    <Text style={styles.commandStatHint}>Soon</Text>
                  </View>
                </View>
                <Pressable
                  pressOpacityFeedback={false}
                  haptic
                  onPress={() => router.push('/activity-my-shop')}
                  style={({ pressed }) => [styles.commandCta, pressed && styles.commandCtaPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Open my shop workspace"
                >
                  <Text style={styles.commandCtaLabel}>Open My Shop</Text>
                </Pressable>
              </View>
            </View>
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 0,
    paddingTop: 12,
  },
  header: {
    paddingHorizontal: 0,
    paddingBottom: 6,
    backgroundColor: ui.surfaceGrouped,
  },
  headerTitleBlock: {
    marginBottom: 10,
  },
  messagesPill: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 10,
    backgroundColor: '#0B1F3A',
  },
  messagesPillPressed: {
    opacity: 0.9,
  },
  messagesPillLabel: {
    fontSize: 13,
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
  needsAttentionWrap: {
    paddingHorizontal: 0,
    marginBottom: 8,
  },
  needsAttentionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#C2410C',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 5,
  },
  needsAttentionCard: {
    backgroundColor: ui.background,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    paddingVertical: 8,
    paddingHorizontal: 10,
    ...shadowCard,
  },
  needsAttentionCardPressed: {
    backgroundColor: ui.surfaceStriped,
  },
  needsAttentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  needsAttentionThumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: ui.surfaceNeutral,
  },
  needsAttentionThumbPh: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  needsAttentionMid: {
    flex: 1,
    minWidth: 0,
  },
  needsAttentionEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    color: ui.textSecondary,
    marginBottom: 1,
  },
  needsAttentionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: ui.textPrimary,
  },
  needsAttentionMeta: {
    fontSize: 12,
    color: ui.textSecondary,
    marginTop: 1,
  },
  needsAttentionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  needsAttentionCountBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: '#FFF4E6',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  needsAttentionCountText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B45309',
  },
  commandRow: {
    flexDirection: 'column',
    gap: 7,
    paddingHorizontal: 0,
    marginBottom: 12,
  },
  commandModule: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    paddingHorizontal: 11,
  },
  /** Renter / discovery — blue wash; sibling to My shop. */
  commandModuleRenting: {
    backgroundColor: 'rgba(239, 246, 255, 0.92)',
    borderColor: 'rgba(11, 31, 58, 0.16)',
  },
  /** Owner / operations — equal pillar; calmer mint wash vs Renting’s blue wash. */
  commandModuleShop: {
    backgroundColor: 'rgba(240, 253, 244, 0.55)',
    borderColor: 'rgba(22, 101, 52, 0.14)',
  },
  commandModuleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  commandModuleTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.25,
    color: ui.textPrimary,
  },
  commandModuleSub: {
    fontSize: 12,
    color: ui.textSecondary,
    lineHeight: 16,
    marginBottom: 6,
  },
  commandStatList: {
    marginBottom: 6,
    gap: 2,
  },
  commandStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    paddingVertical: 1,
  },
  commandStatLabel: {
    fontSize: 12,
    color: ui.textSecondary,
    flex: 1,
  },
  commandStatValue: {
    fontSize: 14,
    fontWeight: '800',
    color: ui.textPrimary,
  },
  commandStatValueMuted: {
    fontSize: 12,
    fontWeight: '600',
    color: ui.textSecondary,
  },
  commandStatHint: {
    fontSize: 12,
    fontWeight: '600',
    color: ui.textSecondary,
  },
  commandCta: {
    alignSelf: 'stretch',
    minHeight: 44,
    justifyContent: 'center',
    marginTop: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(11, 31, 58, 0.08)',
    alignItems: 'center',
  },
  commandCtaPressed: {
    backgroundColor: 'rgba(11, 31, 58, 0.14)',
  },
  commandCtaLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: ui.primary,
    letterSpacing: -0.1,
  },
});
