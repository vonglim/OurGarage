import { CardPressable } from '@/components/CardPressable';
import { RootScreenHeader } from '@/components/AppHeaders';
import { KeyboardDismissScreen } from '@/components/KeyboardDismissScreen';
import { MainTabFab, useMainTabFabBottomReserve } from '@/components/MainTabFab';
import { Pressable } from '@/components/Pressable';
import { RequestListCardInner } from '@/components/RequestListCardInner';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ui } from '@/constants/appUi';
import { getAuthUserIdSync } from '@/lib/authUser';
import { formatDurationDisplay } from '@/lib/durationFormat';
import { formatUsd, getNumericTotalPrice } from '@/lib/money';
import {
  distanceSortKeyRequest,
  isRequestActiveForBrowse,
} from '@/lib/openRequestsForBrowse';
import { formatMilesShort, milesFromViewerToRequest } from '@/lib/requestDistance';
import {
  formatNegotiationCooldownRemaining,
  getRenterBrowseNegotiationCardState,
} from '@/lib/negotiationLifecycle';
import { getRequestSupabaseRowId } from '@/lib/requestOwnership';
import { hydrateListingsFromSupabase } from '@/lib/hydrateListingsFromSupabase';
import { isToolListingVisibleOnBrowseFeed } from '@/lib/listingOwnership';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { ToolListing } from '@/store/listingsStore';
import { formatListingPriceWithUnit, useListingsStore } from '@/store/listingsStore';
import { getRentalsForRequest } from '@/store/rentalsStore';
import { useOffersStore } from '@/store/offersStore';
import {
  getEffectiveRentalStatus,
  refreshRequestsFromSupabase,
  useRequestsStore,
} from '@/store/requestsStore';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Image, PanResponder, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

/** Dev-only: where Browse reads requests (for provenance logging). */
const REQUESTS_STORE_MODULE = 'store/requestsStore.ts';
const REQUESTS_STORE_SELECTOR = 'useRequestsStore((state) => state.requests)';

function matchesSearchRequests(req: Record<string, unknown>, q: string): boolean {
  if (!q) return true;
  const hay = [
    req.toolName,
    req.description,
    req.location,
    req.when,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

function matchesSearchListings(item: ToolListing, q: string): boolean {
  if (!q) return true;
  const hay = [item.name, item.description, item.ownerName].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}

/** Relative time for browse cards — matches request-details wording. */
function postedTimeAgoPhrase(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(diffMs / (60 * 1000));
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  let rel: string;
  if (seconds < 60) rel = 'just now';
  else if (minutes < 60) rel = minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  else if (hours < 24) rel = hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  else rel = days === 1 ? '1 day ago' : `${days} days ago`;

  return `Posted ${rel}`;
}

async function navigateToRentalWorkspace(
  router: Router,
  input: { requestTimestamp: number; offerId: string; requestRowId: string }
): Promise<void> {
  const local = getRentalsForRequest(input.requestTimestamp).find(
    (r) => r.offerId === input.offerId
  );
  if (local) {
    router.push({ pathname: '/rental/[id]', params: { id: local.id } });
    return;
  }
  if (isSupabaseConfigured()) {
    const { getSupabase } = await import('@/lib/supabase');
    const { data } = await getSupabase()
      .from('rentals')
      .select('id')
      .eq('offer_id', input.offerId)
      .maybeSingle();
    const rid =
      data && typeof (data as { id?: unknown }).id === 'string'
        ? String((data as { id: string }).id).trim()
        : '';
    if (rid) {
      router.push({ pathname: '/rental/[id]', params: { id: rid } });
      return;
    }
  }
  router.push({
    pathname: '/offer-detail',
    params: { requestId: input.requestRowId, offerId: input.offerId },
  });
}

export default function Browse() {
  const router = useRouter();
  const params = useLocalSearchParams<{ query?: string | string[]; mode?: string | string[] }>();
  const fabBottomReserve = useMainTabFabBottomReserve();
  const [mode, setMode] = useState('requests');
  const swipeTabsByDirection = useCallback(
    (dx: number) => {
      if (dx <= -40 && mode === 'requests') setMode('tools');
      if (dx >= 40 && mode === 'tools') setMode('requests');
    },
    [mode]
  );

  const tabSwipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_evt, gesture) => {
          const absDx = Math.abs(gesture.dx);
          const absDy = Math.abs(gesture.dy);
          return absDx > 24 && absDx > absDy * 1.2;
        },
        onPanResponderRelease: (_evt, gesture) => {
          swipeTabsByDirection(gesture.dx);
        },
        onPanResponderTerminate: (_evt, gesture) => {
          swipeTabsByDirection(gesture.dx);
        },
      }),
    [swipeTabsByDirection]
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [listingsRefreshing, setListingsRefreshing] = useState(false);

  const listings = useListingsStore((s) => s.listings);
  const requests = useRequestsStore((state) => state.requests);
  const offersFromStore = useOffersStore((s) => s.offers);
  const [browseLifecycleNow, setBrowseLifecycleNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setBrowseLifecycleNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  useFocusEffect(
    useCallback(() => {
      const rawQ = params.query;
      const rawM = params.mode;
      const qParam = (Array.isArray(rawQ) ? rawQ[0] : rawQ) ?? '';
      const mParam = (Array.isArray(rawM) ? rawM[0] : rawM) ?? '';

      const hasQuery = qParam.trim() !== '';
      const hasMode = mParam === 'tools' || mParam === 'requests';

      if (hasQuery) setSearchQuery(qParam);
      if (hasMode) setMode(mParam);

      if (hasQuery || hasMode) {
        router.setParams({ query: '', mode: '' });
      }
    }, [params.query, params.mode, router])
  );

  useFocusEffect(
    useCallback(() => {
      void refreshRequestsFromSupabase();
      void hydrateListingsFromSupabase();
    }, [])
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void hydrateListingsFromSupabase();
      }
    });
    return () => sub.remove();
  }, []);

  const onRefreshListings = useCallback(async () => {
    setListingsRefreshing(true);
    try {
      await hydrateListingsFromSupabase();
    } finally {
      setListingsRefreshing(false);
    }
  }, []);

  const q = searchQuery.trim().toLowerCase();

  const { requestRows, requestEmpty, requestPipeline } = useMemo(() => {
    if (mode !== 'requests') {
      return {
        requestRows: [] as Record<string, unknown>[],
        requestEmpty: '',
        requestPipeline: null as {
          rawInStore: number;
          afterBrowseActiveFilter: number;
          afterSearchQuery: number;
          renderedSorted: number;
        } | null,
      };
    }
    const data = requests;
    const active = data.filter(isRequestActiveForBrowse);
    const filtered = q ? active.filter((r) => matchesSearchRequests(r, q)) : active;
    const sorted = [...filtered].sort(
      (a, b) => distanceSortKeyRequest(a) - distanceSortKeyRequest(b)
    );
    const empty =
      sorted.length === 0
        ? active.length === 0
          ? 'No open requests nearby right now.'
          : 'Nothing matches your search.'
        : '';
    return {
      requestRows: sorted,
      requestEmpty: empty,
      requestPipeline: {
        rawInStore: data.length,
        afterBrowseActiveFilter: active.length,
        afterSearchQuery: filtered.length,
        renderedSorted: sorted.length,
      },
    };
  }, [mode, q, requests]);

  useEffect(() => {
    if (!__DEV__ || mode !== 'requests' || requestPipeline == null) return;

    const fromStoreGetState = useRequestsStore.getState().requests;
    const sameArrayRef = fromStoreGetState === requests;

    console.log('[Browse][requests] provenance', {
      screen: 'app/(tabs)/browse.tsx',
      storeModule: REQUESTS_STORE_MODULE,
      subscription: REQUESTS_STORE_SELECTOR,
      getStateSameArrayAsHook: sameArrayRef,
      counts: {
        storeItems: requests.length,
        ...requestPipeline,
      },
      searchQuery: q || '(none)',
      note:
        'Store is filled by refreshRequestsFromSupabase() + addRequest(); see store/requestsStore.ts and lib/supabaseRequests.ts.',
    });

    if (requests.length === 0) {
      console.log('[Browse][requests] store array is empty (initial state: requests: [] in requestsStore).');
      return;
    }

    requests.forEach((r, index) => {
      const row = r as Record<string, unknown>;
      console.log(`[Browse][requests][${index}]`, {
        source: REQUESTS_STORE_MODULE,
        timestamp: row.timestamp,
        id: row.id,
        toolName: row.toolName,
        posterUserId: row.posterUserId,
        ownerId: row.ownerId,
        matched: row.matched,
        fulfilled: row.fulfilled,
        rentalStatus: row.rentalStatus,
        status: row.status,
        devSeedId: row.devSeedId,
        browseWouldShow: isRequestActiveForBrowse(r),
      });
    });

    if (requestPipeline.renderedSorted !== requestPipeline.rawInStore) {
      console.log('[Browse][requests] UI uses a subset of the store:', {
        reason: 'isRequestActiveForBrowse + optional search + distance sort',
        notRenderedCount: requestPipeline.rawInStore - requestPipeline.renderedSorted,
      });
    }
  }, [
    mode,
    q,
    requests,
    requestPipeline?.rawInStore,
    requestPipeline?.afterBrowseActiveFilter,
    requestPipeline?.afterSearchQuery,
    requestPipeline?.renderedSorted,
  ]);

  const { toolRows, toolEmpty } = useMemo(() => {
    const uid = getAuthUserIdSync();
    const visible = listings.filter((l) => isToolListingVisibleOnBrowseFeed(l, uid));
    const filtered = q ? visible.filter((l) => matchesSearchListings(l, q)) : [...visible];
    filtered.sort((a, b) => a.distance - b.distance);
    const empty =
      filtered.length === 0
        ? listings.length === 0
          ? 'No equipment listed yet.'
          : 'Nothing matches your search.'
        : '';
    return { toolRows: filtered, toolEmpty: empty };
  }, [listings, q]);

  return (
    <ScreenWrapper style={styles.screenWrap}>
      <KeyboardDismissScreen style={styles.root} {...tabSwipeResponder.panHandlers}>
        <ScreenEntrance style={styles.screenInner}>
          <ScrollView
            style={styles.container}
            contentContainerStyle={[
              styles.content,
              { paddingTop: 16, paddingBottom: fabBottomReserve },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={listingsRefreshing} onRefresh={() => void onRefreshListings()} />
            }
          >
          <RootScreenHeader title="Browse" />

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
                Requests
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMode('tools')}
              style={({ pressed }) => [
                styles.segmentItem,
                mode === 'tools' && styles.segmentItemActive,
                pressed && styles.segmentPressed,
              ]}
            >
              <Text style={[styles.segmentLabel, mode === 'tools' && styles.segmentLabelActive]}>
                Rentals
              </Text>
            </Pressable>
          </View>

          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search equipment"
            placeholderTextColor={ui.textSecondary}
            style={styles.searchInput}
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCorrect={false}
            autoCapitalize="none"
          />

          {mode === 'requests' ? (
            requestRows.length === 0 ? (
              <Text style={styles.emptyText}>{requestEmpty}</Text>
            ) : (
              requestRows.map((req, idx) => {
                const ts = req.timestamp as number | undefined;
                const posterId =
                  typeof (req as { posterUserId?: string }).posterUserId === 'string'
                    ? (req as { posterUserId: string }).posterUserId
                    : undefined;
                const me = getAuthUserIdSync();
                const meTrim = typeof me === 'string' ? me.trim() : '';
                const isOwner = posterId != null && posterId === meTrim;
                const postedAgo =
                  ts != null && Number.isFinite(ts) ? postedTimeAgoPhrase(ts) : null;

                const detailsId = getRequestSupabaseRowId(req as Record<string, unknown>);
                const myOffer =
                  ts != null && meTrim !== ''
                    ? offersFromStore.find(
                        (o) => o.requestId === ts && o.renterId.trim() === meTrim
                      )
                    : undefined;

                const matched = Boolean((req as { matched?: boolean }).matched);
                const acceptedOfferId = String(
                  (req as { acceptedOfferId?: string | null }).acceptedOfferId ?? ''
                ).trim();
                const rentalLife = getEffectiveRentalStatus(
                  req as Parameters<typeof getEffectiveRentalStatus>[0]
                );
                const iAmMatchedRenter =
                  matched &&
                  myOffer != null &&
                  acceptedOfferId !== '' &&
                  acceptedOfferId === myOffer.id;

                const cardState =
                  !isOwner && meTrim !== ''
                    ? getRenterBrowseNegotiationCardState(myOffer, meTrim, browseLifecycleNow)
                    : { kind: 'none' as const };

                let negotiationHint: string | null = null;
                if (!isOwner && cardState.kind !== 'none') {
                  switch (cardState.kind) {
                    case 'locked':
                      negotiationHint = 'Negotiation closed';
                      break;
                    case 'active_pending':
                      negotiationHint = cardState.awaitingTheirMove
                        ? 'Counter pending — your turn'
                        : 'Waiting for their response';
                      break;
                    case 'active_pending_confirmation':
                      negotiationHint = 'Awaiting owner confirmation';
                      break;
                    case 'declined':
                      negotiationHint = 'Negotiation closed';
                      break;
                    case 'withdrawn_cooldown':
                      negotiationHint = `Offer withdrawn. You can re-offer in ${formatNegotiationCooldownRemaining(cardState.remainingMs)}.`;
                      break;
                    case 'withdrawn_can_reoffer':
                      negotiationHint = 'Offer withdrawn. You can start a new offer.';
                      break;
                    default:
                      negotiationHint = null;
                  }
                }

                const browseOfferAction =
                  !isOwner && ts != null
                    ? !detailsId
                      ? {
                          disabled: true as const,
                          label: 'Make an offer',
                          onPress: () => undefined,
                        }
                      : iAmMatchedRenter &&
                          (rentalLife === 'matched' ||
                            rentalLife === 'active' ||
                            rentalLife === 'completed')
                        ? {
                            disabled: false as const,
                            label: 'Open Rental',
                            tone: 'rental' as const,
                            onPress: () => {
                              void navigateToRentalWorkspace(router, {
                                requestTimestamp: ts,
                                offerId: String(myOffer!.id),
                                requestRowId: detailsId,
                              });
                            },
                          }
                      : cardState.kind === 'locked' && myOffer
                        ? {
                            disabled: false as const,
                            label: 'View negotiation',
                            tone: 'negotiation' as const,
                            onPress: () => {
                              router.push({
                                pathname: '/offer-detail',
                                params: {
                                  requestId: detailsId,
                                  offerId: String(myOffer.id),
                                },
                              });
                            },
                          }
                      : cardState.kind === 'withdrawn_can_reoffer'
                        ? {
                            disabled: false as const,
                            label: 'Make New Offer',
                            tone: 'default' as const,
                            onPress: () => {
                              router.push({
                                pathname: '/make-offer',
                                params: { requestId: detailsId },
                              });
                            },
                          }
                      : myOffer == null
                        ? {
                            disabled: false as const,
                            label: 'Make an offer',
                            tone: 'default' as const,
                            onPress: () => {
                              router.push({
                                pathname: '/make-offer',
                                params: { requestId: detailsId },
                              });
                            },
                          }
                        : {
                            disabled: false as const,
                            label: 'View negotiation',
                            tone: 'negotiation' as const,
                            onPress: () => {
                              router.push({
                                pathname: '/offer-detail',
                                params: {
                                  requestId: detailsId,
                                  offerId: String(myOffer.id),
                                },
                              });
                            },
                          }
                    : null;

                return (
                  <View
                    key={ts ?? idx}
                    style={[
                      styles.card,
                      idx === 0 && styles.cardEdge,
                      isOwner && styles.cardOwnRequest,
                      !detailsId && styles.cardDisabled,
                      myOffer && !isOwner && styles.cardMyNegotiation,
                    ]}
                  >
                    <RequestListCardInner
                      req={req as never}
                      matched={matched}
                      timeAgoText={postedAgo}
                      offerAction={browseOfferAction}
                    />
                    {isOwner ? <Text style={styles.cardOwnRequestLabel}>Your request</Text> : null}
                    {negotiationHint ? (
                      <Text style={styles.cardNegotiationHint}>{negotiationHint}</Text>
                    ) : null}
                  </View>
                );
              })
            )
          ) : toolRows.length === 0 ? (
            <Text style={styles.emptyText}>{toolEmpty}</Text>
          ) : (
            toolRows.map((item, idx) => {
              const priceStr = formatListingPriceWithUnit(item.price, item.priceUnit);
              const distStr = formatMilesShort(item.distance);
              const ownerId = item.ownerUserId;
              const isOwnListing =
                ownerId != null &&
                ownerId !== '' &&
                ownerId === getAuthUserIdSync();
              return (
                <CardPressable
                  key={item.id}
                  onPress={() =>
                    router.push({
                      pathname: '/listing-detail',
                      params: { listingId: item.id },
                    })
                  }
                  style={({ pressed }) => [
                    styles.card,
                    idx === 0 && styles.cardEdge,
                    pressed && styles.cardPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={
                    isOwnListing
                      ? `${item.name}, ${priceStr}, ${distStr}, your listing`
                      : `${item.name}, ${priceStr}, ${distStr}`
                  }
                >
                  <View style={{ flexDirection: 'row', gap: 12 }}>

  {/* IMAGE (fixed size thumbnail) */}
  <View
    style={{
      width: 90,
      height: 90,
      borderRadius: 10,
      backgroundColor: '#F3F4F6',
      overflow: 'hidden',
    }}
  >
    {item.images?.[0] ? (
      <Image
        source={{ uri: item.images[0] }}
        style={{ width: '100%', height: '100%' }}
        resizeMode="cover"
      />
    ) : null}
  </View>

  {/* TEXT */}
  <View style={{ flex: 1, justifyContent: 'center' }}>

    <Text style={styles.cardTitle} numberOfLines={1}>
      {item.name}
    </Text>

    <Text style={styles.cardPricePrimary}>
      {priceStr}
    </Text>

    <Text style={styles.cardDistance}>
      {distStr}
    </Text>

    {item.description?.trim() ? (
      <Text style={styles.cardDesc} numberOfLines={1}>
        {item.description.trim()}
      </Text>
    ) : null}

    {isOwnListing ? (
      <Text style={styles.cardOwnLabel}>
        Your listing
      </Text>
    ) : null}

  </View>

</View>
                </CardPressable>
              );
            })
          )}
          </ScrollView>

          <MainTabFab />
        </ScreenEntrance>
      </KeyboardDismissScreen>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  screenWrap: {
    backgroundColor: ui.background,
  },
  root: {
    flex: 1,
    backgroundColor: ui.background,
  },
  screenInner: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: ui.background,
  },
  content: {
    paddingHorizontal: 0,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: ui.textPrimary,
    marginBottom: ui.spaceMd,
    letterSpacing: -0.3,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: ui.surfaceNeutral,
    borderRadius: ui.radiusInput,
    padding: 3,
    marginBottom: ui.spaceSm + 2,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: ui.radiusInput - 4,
  },
  segmentItemActive: {
    backgroundColor: ui.background,
  },
  segmentPressed: {
    opacity: 0.92,
  },
  segmentLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: ui.textSecondary,
  },
  segmentLabelActive: {
    color: ui.textPrimary,
  },
  searchInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    borderRadius: ui.radiusInput,
    paddingHorizontal: ui.spaceMd - 2,
    paddingVertical: 9,
    fontSize: 16,
    color: ui.textPrimary,
    backgroundColor: ui.surfaceInput,
    marginBottom: ui.spaceSm + 2,
  },
  emptyText: {
    color: ui.textSubtle,
    fontSize: 15,
    textAlign: 'center',
    marginTop: ui.spaceSection,
    lineHeight: 22,
    paddingHorizontal: 12,
  },
  card: {
    backgroundColor: ui.background,
    paddingVertical: 5,
    paddingHorizontal: 13,
    borderBottomWidth: 1,
    borderBottomColor: ui.border,
  },
  /** Top edge of list for a light enclosure under the search field. */
  cardEdge: {
    borderTopWidth: 1,
    borderTopColor: ui.border,
  },
  cardPressed: {
    backgroundColor: ui.surfaceStriped,
  },
  cardDisabled: {
    opacity: 0.55,
  },
  cardOwnRequest: {
    backgroundColor: ui.surfaceTintPrimary,
    borderLeftWidth: 3,
    borderLeftColor: ui.primary,
    /** Border is inset; nudge padding so text aligns with non-owner rows (~13 from list edge). */
    paddingLeft: 10,
  },
  cardOwnRequestPressed: {
    backgroundColor: ui.surfaceStriped,
    borderLeftColor: ui.primary,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: ui.textPrimary,
    marginBottom: 0,
    lineHeight: 19,
    letterSpacing: -0.25,
  },
  cardPostedAgo: {
    marginTop: 3,
    marginBottom: 1,
    fontSize: 13,
    fontWeight: '500',
    color: ui.textSecondary,
    lineHeight: 16,
  },
  /** Request row: price (semi-bold) + duration (muted). */
  cardPriceDuration: {
    marginTop: 0,
    marginBottom: 0,
    lineHeight: 18,
  },
  cardPrice: {
    fontSize: ui.fontPrice,
    fontWeight: '600',
    color: ui.textPrimary,
    letterSpacing: -0.2,
  },
  cardMuted: {
    fontSize: 14,
    fontWeight: '400',
    color: ui.textSecondary,
  },
  /** Listing row: full price + unit line. */
  cardPricePrimary: {
    fontSize: ui.fontPrice,
    fontWeight: '600',
    color: ui.textPrimary,
    letterSpacing: -0.2,
    lineHeight: 18,
    marginTop: 0,
    marginBottom: 0,
  },
  /** Distance on its own line (requests + listings). */
  cardDistance: {
    fontSize: 13,
    fontWeight: '400',
    color: ui.textSecondary,
    lineHeight: 16,
    marginTop: 0,
    marginBottom: 0,
  },
  cardDesc: {
    fontSize: 12,
    fontWeight: '400',
    color: ui.textSecondary,
    lineHeight: 15,
    marginTop: 0,
    marginBottom: 0,
  },
  cardOwnLabel: {
    marginTop: 8,
    marginBottom: 4,
    fontSize: 12,
    fontWeight: '600',
    color: ui.textSecondary,
    letterSpacing: 0.2,
  },
  cardOwnRequestLabel: {
    marginTop: 8,
    marginBottom: 4,
    fontSize: 12,
    fontWeight: '700',
    color: ui.primary,
    opacity: 0.75,
    letterSpacing: 0.2,
  },
  cardMyNegotiation: {
    borderLeftWidth: 3,
    borderLeftColor: '#F9A825',
    paddingLeft: 10,
    backgroundColor: '#FFFBF0',
  },
  cardNegotiationHint: {
    marginTop: 6,
    marginBottom: 4,
    fontSize: 12,
    fontWeight: '600',
    color: '#E65100',
    letterSpacing: 0.1,
  },
  cardMakeOfferHint: {
    marginTop: 8,
    marginBottom: 4,
    fontSize: 13,
    fontWeight: '600',
    color: ui.primary,
    letterSpacing: -0.1,
  },
});
