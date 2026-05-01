import { Pressable } from '@/components/Pressable';
import { ScreenBackButton } from '@/components/ScreenBackButton';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from '@/components/KeyboardDismissScreen';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { OfferOffererRow } from '@/components/OfferOffererRow';
import { RequestMetaLines } from '@/components/RequestMetaLines';
import {
  destructiveOutlinePressed,
  outlinePrimaryPressed,
  primarySolidPressed,
  ui,
} from '@/constants/appUi';
import { useAuthUserId } from '@/lib/authUser';
import { formatUsd, getNumericOfferPrice, getNumericTotalPrice } from '@/lib/money';
import { openChatForRequest } from '@/lib/openRequestChat';
import { getRequestOwnerId, isUuidString } from '@/lib/requestOwnership';
import { billingDayCountForRequest, formatPerDayUsd } from '@/lib/requestPriceContext';
import { fetchOffersByRequestIdWithProfiles } from '@/lib/supabaseOffers';
import { getSupabase } from '@/lib/supabase';
import { mapSupabaseOfferRowToOffer } from '@/lib/supabaseOffers';
import {
  type Offer,
  getOfferUserPreview,
  sortOffersForPoster,
  useOffersStore,
} from '@/store/offersStore';
import {
  getEffectiveRentalStatus,
  getRequestBySupabaseId,
  isLeaveReviewEligible,
  requestAcceptsOffers,
  showMarkRentalComplete,
} from '@/store/requestsStore';
import { useUserReviews } from '@/store/userReviewsStore';

const EMPTY_OFFERS: Offer[] = [];

function formatOwnerOfferCountMessage(count: number): string {
  if (count <= 0) return '';
  if (count === 1) return 'You have 1 offer';
  return `You have ${count} offers`;
}

/** Combine Supabase-backed rows with in-memory threads for the same app request (`requestId` = timestamp). */
function mergeOfferThreadsForRequest(
  fromServer: Offer[],
  fromStore: Offer[],
  requestTs: number
): Offer[] {
  const byRenter = new Map<string, Offer>();
  for (const o of fromServer) {
    if (typeof o.renterId !== 'string' || o.renterId === '') continue;
    byRenter.set(o.renterId, o);
  }
  for (const o of fromStore) {
    if (o.requestId !== requestTs) continue;
    if (typeof o.renterId !== 'string' || o.renterId === '') continue;
    const prev = byRenter.get(o.renterId);
    if (!prev || o.updatedAt >= prev.updatedAt) byRenter.set(o.renterId, o);
  }
  return sortOffersForPoster([...byRenter.values()]);
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

export default function RequestDetailsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams() as {
  requestId?: string;
  requestTimestamp?: string;
  offerId?: string;
};

const requestTimestampParam = params.requestTimestamp ?? '';
const offerId = params.offerId ?? '';
const requestId = params.requestId ?? '';

  const [tick, setTick] = useState(0);
  /** Mapped from Supabase `offers` rows for this request. */
  const [offers, setOffers] = useState<Offer[]>([]);
  const userReviews = useUserReviews();
  const currentUserId = useAuthUserId();

  useFocusEffect(
    useCallback(() => {
      setTick((t) => t + 1);
    }, [])
  );

  const request = useMemo(() => {
    void tick;
    if (!isUuidString(requestId)) return undefined;
    return getRequestBySupabaseId(requestId);
  }, [requestId, tick]);

  const fetchOffers = useCallback(async () => {
    if (!isUuidString(requestId)) {
      setOffers([]);
      return;
    }

    const supabase = getSupabase();
    const { data, error } = await fetchOffersByRequestIdWithProfiles(supabase, requestId);

    if (error) {
      if (__DEV__) console.warn('[Request details] offers fetch:', error.message);
      setOffers([]);
      return;
    }

    const req = getRequestBySupabaseId(requestId);
    const ts =
      req != null &&
      typeof (req as { timestamp?: unknown }).timestamp === 'number' &&
      Number.isFinite((req as { timestamp: number }).timestamp)
        ? (req as { timestamp: number }).timestamp
        : NaN;
    if (!Number.isFinite(ts)) {
      setOffers([]);
      return;
    }

    const rows = (data ?? []) as unknown[];
    const mapped = rows.map((r) => mapSupabaseOfferRowToOffer(r as Record<string, unknown>, ts));
    setOffers(mapped);

    const { upsertOffer } = useOffersStore.getState();
    for (const o of mapped) {
      upsertOffer(o);
    }
  }, [requestId]);

  useEffect(() => {
    void fetchOffers();
  }, [fetchOffers, tick]);

  const requestTimestamp = request?.timestamp;
  const storeOffers = useOffersStore((s) => s.offers);
  const offersFromStore = useMemo(() => {
    const ts = requestTimestamp;
    if (typeof ts !== 'number' || !Number.isFinite(ts)) return EMPTY_OFFERS;
    const out = storeOffers.filter((o) => o.requestId === ts);
    return out.length === 0 ? EMPTY_OFFERS : out;
  }, [storeOffers, requestTimestamp]);

  const displayOffers = useMemo(() => {
    const ts = requestTimestamp;
    if (typeof ts !== 'number' || !Number.isFinite(ts)) {
      return sortOffersForPoster(offers);
    }
    return mergeOfferThreadsForRequest(offers, offersFromStore, ts);
  }, [offers, offersFromStore, requestTimestamp]);

  /** Owner sees all negotiation threads; renters only see their own thread. */
  const visibleOffers = useMemo(() => {
    if (!request) return [];
    const ownerId = getRequestOwnerId(request as Record<string, unknown>);
    if (ownerId != null && ownerId === currentUserId) return displayOffers;
    return displayOffers.filter(
      (o) => typeof o.renterId === 'string' && o.renterId === currentUserId
    );
  }, [request, currentUserId, displayOffers]);

  const requestDayCount = useMemo(
    () => (request ? billingDayCountForRequest(request) : 1),
    [request]
  );
  const listedTotalNum = useMemo(() => (request ? getNumericTotalPrice(request) : null), [request]);
  const listedPerDayLine = useMemo(() => {
    if (listedTotalNum == null || !Number.isFinite(listedTotalNum) || listedTotalNum <= 0) return null;
    return `Listed at ${formatPerDayUsd(listedTotalNum, requestDayCount)}`;
  }, [listedTotalNum, requestDayCount]);

  const matched = !!request?.matched;
  const rentalStatus = request ? getEffectiveRentalStatus(request) : 'pending';
  const requestTs = request?.timestamp;
  
  const reviewed =
    requestTs != null && userReviews.some((r) => r.requestTimestamp === requestTs);
  const reviewType = 'renter';

  if (!requestId || !isUuidString(requestId)) {
    return (
      <ScreenWrapper style={styles.screenWrap}>
        <KeyboardDismissScreen style={styles.centered}>
          <ScreenEntrance style={styles.entranceFillCentered}>
            <Text style={styles.muted}>Invalid request.</Text>
          </ScreenEntrance>
        </KeyboardDismissScreen>
      </ScreenWrapper>
    );
  }

  if (!request) {
    return (
      <ScreenWrapper style={styles.screenWrap}>
        <KeyboardDismissScreen style={styles.centered}>
          <ScreenEntrance style={styles.entranceFillCentered}>
            <Text style={styles.muted}>Request not found.</Text>
          </ScreenEntrance>
        </KeyboardDismissScreen>
      </ScreenWrapper>
    );
  }
  const requestOwnerId = getRequestOwnerId(request as Record<string, unknown>);
  
  const isOwner = requestOwnerId != null && requestOwnerId !== '' && requestOwnerId === currentUserId;

  const ownerOpenForOffers =
    isOwner &&
    !matched &&
    request.timestamp != null &&
    requestAcceptsOffers(request.timestamp);

  const showOwnerWaitingForOffers = ownerOpenForOffers && visibleOffers.length === 0;
  const showOwnerHasOffersSummary = ownerOpenForOffers && visibleOffers.length > 0;

  const onEditRequest = () => {
    if (request.timestamp == null || matched || !isOwner) return;
    router.push({
      pathname: '/request',
      params: { editTimestamp: String(request.timestamp) },
    });
  };

  const canMakeOffer =
    request.timestamp != null &&
    !matched &&
    !isOwner &&
    requestAcceptsOffers(request.timestamp) &&
    !visibleOffers.some(
      (o) =>
        typeof o.renterId === 'string' &&
        o.renterId === currentUserId &&
        o.status === 'pending_confirmation'
    );

  const onMakeOffer = () => {
    if (request.timestamp == null || matched || isOwner || !requestAcceptsOffers(request.timestamp))
      return;
    if (
      visibleOffers.some(
        (o) =>
          typeof o.renterId === 'string' &&
          o.renterId === currentUserId &&
          o.status === 'pending_confirmation'
      )
    )
      return;
    router.push({
      pathname: '/make-offer',
      params: { requestId: requestId },
    });
  };

  const onMessage = () => {
    if (request.timestamp == null || !matched) return;
    openChatForRequest(router, request.timestamp);
  };

  const onEndRental = () => {
    if (request.timestamp == null) return;
    router.push({
      pathname: '/end-rental',
      params: { requestId: String(request.timestamp) },
    });
  };

  const onLeaveReview = () => {
    if (request.timestamp == null) return;
    router.push(
      `/leave-review?requestTimestamp=${encodeURIComponent(String(request.timestamp))}&type=${reviewType}`
    );
  };

  return (
    <ScreenWrapper style={styles.screenWrap}>
      <KeyboardDismissScreen style={styles.screen}>
        <ScreenEntrance style={styles.entranceFlex}>
          <View style={[styles.header, { paddingTop: 8 }]}>
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <ScreenBackButton onPress={() => router.back()} style={styles.backHit} />
            </View>
            <Text style={styles.headerTitleCenter} numberOfLines={1}>
              Request details
            </Text>
            <View style={styles.headerRight}>
              {!isOwner && canMakeOffer ? (
                <Pressable
                  pressOpacityFeedback={false}
                  haptic
                  onPress={onMakeOffer}
                  style={({ pressed }) => [
                    styles.headerMakeOfferBtn,
                    pressed && primarySolidPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Make offer"
                >
                  <Text style={styles.headerMakeOfferBtnText}>Make Offer</Text>
                </Pressable>
              ) : isOwner ? (
                <Text
                  style={styles.headerOwnerCaption}
                  numberOfLines={2}
                  accessibilityRole="text"
                  accessibilityLabel={
                    showOwnerWaitingForOffers ? 'Waiting for offers' : 'Your request'
                  }
                >
                  {showOwnerWaitingForOffers ? 'Waiting for offers' : 'Your request'}
                </Text>
              ) : (
                <View style={styles.headerRightSpacer} />
              )}
            </View>
          </View>
        </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 40 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.toolName}>{request.toolName || 'No name'}</Text>
        {request.timestamp != null ? (
          <Text style={styles.detailMuted}>Posted {getTimeAgo(request.timestamp)}</Text>
        ) : null}
        {rentalStatus === 'completed' ? (
          <Text style={styles.statusCompleted}>Rental completed</Text>
        ) : rentalStatus === 'active' ? (
          <Text style={styles.statusActive}>Rental active</Text>
        ) : matched ? (
          <Text style={styles.statusMatched}>Matched</Text>
        ) : null}
        {rentalStatus === 'active' && request.rentalStart != null ? (
          <Text style={styles.detailMuted}>Rental started {getTimeAgo(request.rentalStart)}</Text>
        ) : null}
        {matched && (
          <Text style={styles.acceptedPriceBanner}>
            Accepted total for entire duration: {formatUsd(request.acceptedPrice)}
          </Text>
        )}
        <Text style={styles.detail}>When: {request.when || 'N/A'}</Text>
        <RequestMetaLines req={request} detailStyle={styles.detail} />

        {showOwnerWaitingForOffers ? (
          <Text style={styles.waitingForOffersHint}>Waiting for offers</Text>
        ) : showOwnerHasOffersSummary ? (
          <Text style={styles.ownerHasOffersHint}>
            {formatOwnerOfferCountMessage(visibleOffers.length)}
          </Text>
        ) : null}

        {!matched ? (
          isOwner ? (
            <Pressable
              pressOpacityFeedback={false}
              haptic
              onPress={onEditRequest}
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
            >
              <Text style={styles.secondaryBtnText}>Edit Request</Text>
            </Pressable>
          ) : null
        ) : (
          <Pressable
            pressOpacityFeedback={false}
            onPress={onMessage}
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
          >
            <Text style={styles.secondaryBtnText}>Message</Text>
          </Pressable>
        )}

        {showMarkRentalComplete(request) ? (
          <Pressable
            pressOpacityFeedback={false}
            onPress={onEndRental}
            style={({ pressed }) => [styles.primaryOutlineBtn, pressed && styles.primaryOutlinePressed]}
          >
            <Text style={styles.primaryOutlineBtnText}>End Rental</Text>
          </Pressable>
        ) : null}

        {isLeaveReviewEligible(request) ? (
          reviewed ? (
            <Text style={styles.reviewedNote}>Review submitted</Text>
          ) : (
            <Pressable
              pressOpacityFeedback={false}
              haptic
              onPress={onLeaveReview}
              style={({ pressed }) => [styles.leaveReviewBtn, pressed && styles.leaveReviewBtnPressed]}
            >
              <Text style={styles.leaveReviewBtnText}>Leave Review</Text>
            </Pressable>
          )
        ) : null}

        <Text style={styles.sectionTitle}>Offers</Text>
        {ownerOpenForOffers && visibleOffers.length > 0 ? (
          <Text style={styles.ownerOfferActionsHint}>
            Open an offer to accept, send a counter-offer, or decline. You can negotiate on price.
          </Text>
        ) : null}
        {listedPerDayLine != null ? <Text style={styles.listedContextLine}>{listedPerDayLine}</Text> : null}
        {visibleOffers.length === 0 ? (
          ownerOpenForOffers ? null : (
            <Text style={styles.muted}>No offers yet</Text>
          )
        ) : (
          visibleOffers.map((offer, index) => {
            const who = getOfferUserPreview(offer);
            const isBestOffer = index === 0;
            const offerTotal = getNumericOfferPrice(offer);
            const theirPerDay =
              offerTotal > 0 ? formatPerDayUsd(offerTotal, requestDayCount) : '—';
            return (
              <View
                key={offer.id}
                style={[styles.offerCard, matched && styles.offerCardMatched]}
              >
                {isBestOffer ? (
                  <Text style={styles.bestOfferLabel}>Best Offer ⭐</Text>
                ) : null}
                <OfferOffererRow
                  name={who.name}
                  rating={who.rating}
                  avatar={who.avatar}
                  lastActive={who.lastActive}
                  onPress={() =>
                    router.push({
                      pathname: '/(tabs)/profile',
                      params: { viewUserId: who.userId },
                    })
                  }
                />
                <Pressable
                  onPress={() => {
                    if (request.timestamp == null) return;
                    router.push({
                      pathname: '/offer-detail',
                      params: {
                        requestId: String(requestId),
                        requestTimestamp: String(request.timestamp ?? ''),
                        offerId: String(offer.id),
                      } as Record<string, string>,
                    });
                  }}
                  style={({ pressed }) => [
                    styles.offerCardTapArea,
                    pressed && styles.offerCardPressed,
                  ]}
                >
                  <Text style={styles.offerPriceLine}>
                    Their offer: {formatUsd(offerTotal)} total ({theirPerDay})
                  </Text>
                  {requestOwnerId != null &&
                  offer.lastUpdatedBy === requestOwnerId &&
                  offer.lastUpdatedBy !== offer.renterId ? (
                    <Text style={styles.offerCounterHint}>Your last counter is shown above</Text>
                  ) : null}
                  {offer.message?.trim() ? (
                    <Text style={styles.offerMessagePreview} numberOfLines={3}>
                      {offer.message.trim()}
                    </Text>
                  ) : null}
                  <Text style={styles.offerTime}>{getTimeAgo(offer.updatedAt)}</Text>
                  <Text style={styles.offerTapHint}>
                    {matched
                      ? 'Tap for details'
                      : offer.status === 'pending_confirmation'
                        ? 'Tap to confirm rental or decline'
                        : 'Tap to accept, counter, or decline'}
                  </Text>
                </Pressable>
              </View>
            );
          })
        )}
      </ScrollView>
      </ScreenEntrance>
      </KeyboardDismissScreen>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  screenWrap: {
    backgroundColor: ui.surfaceGrouped,
  },
  entranceFlex: {
    flex: 1,
  },
  entranceFillCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  screen: {
    flex: 1,
    backgroundColor: ui.surfaceGrouped,
  },
  header: {
    paddingHorizontal: 0,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
    backgroundColor: ui.surfaceGrouped,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
  },
  headerLeft: {
    width: 108,
    flexShrink: 0,
    justifyContent: 'center',
  },
  headerRight: {
    width: 108,
    flexShrink: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  headerRightSpacer: {
    width: 108,
    minHeight: 36,
  },
  backHit: {
    paddingVertical: 4,
  },
  headerTitleCenter: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: ui.textPrimary,
    textAlign: 'center',
  },
  headerMakeOfferBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: ui.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerMakeOfferBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: ui.primaryOn,
    letterSpacing: -0.2,
  },
  headerOwnerCaption: {
    maxWidth: 108,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 15,
    color: ui.primary,
    textAlign: 'right',
    opacity: 0.88,
  },
  container: {
    flex: 1,
    backgroundColor: ui.background,
  },
  content: {
    paddingVertical: 24,
    paddingHorizontal: 0,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 0,
    backgroundColor: ui.background,
  },
  toolName: {
    fontSize: 24,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 8,
  },
  detailMuted: {
    fontSize: 13,
    color: ui.textSecondary,
    marginBottom: 6,
  },
  waitingForOffersHint: {
    marginTop: 4,
    marginBottom: 2,
    fontSize: 14,
    fontWeight: '600',
    color: ui.textSecondary,
    letterSpacing: -0.1,
  },
  ownerHasOffersHint: {
    marginTop: 4,
    marginBottom: 2,
    fontSize: 15,
    fontWeight: '700',
    color: ui.primary,
    letterSpacing: -0.2,
  },
  ownerOfferActionsHint: {
    fontSize: 14,
    color: ui.textSecondary,
    lineHeight: 20,
    marginBottom: 10,
  },
  listedContextLine: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.textPrimary,
    marginBottom: 10,
  },
  statusMatched: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2E7D32',
    marginBottom: 8,
  },
  statusCompleted: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6D4C41',
    marginBottom: 8,
  },
  statusActive: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1565C0',
    marginBottom: 4,
  },
  acceptedPriceBanner: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1B5E20',
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
  },
  detail: {
    fontSize: 15,
    color: ui.textPrimary,
    marginBottom: 6,
  },
  secondaryBtn: {
    marginTop: 16,
    alignSelf: 'stretch',
    paddingVertical: 12,
    borderRadius: ui.radiusButton,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.primary,
    alignItems: 'center',
    backgroundColor: ui.background,
  },
  secondaryBtnPressed: {
    ...outlinePrimaryPressed,
  },
  secondaryBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.primary,
  },
  primaryOutlineBtn: {
    marginTop: 10,
    alignSelf: 'stretch',
    paddingVertical: 12,
    borderRadius: ui.radiusButton,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C62828',
    alignItems: 'center',
    backgroundColor: ui.background,
  },
  primaryOutlinePressed: {
    ...destructiveOutlinePressed,
  },
  primaryOutlineBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#C62828',
  },
  leaveReviewBtn: {
    marginTop: 10,
    alignSelf: 'stretch',
    paddingVertical: 12,
    borderRadius: ui.radiusButton,
    backgroundColor: ui.primary,
    alignItems: 'center',
  },
  leaveReviewBtnPressed: {
    ...primarySolidPressed,
  },
  leaveReviewBtnText: {
    color: ui.primaryOn,
    fontSize: 16,
    fontWeight: '600',
  },
  reviewedNote: {
    marginTop: 14,
    fontSize: 14,
    fontWeight: '500',
    color: ui.textSecondary,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: ui.textPrimary,
    marginTop: 28,
    marginBottom: 12,
  },
  muted: {
    fontSize: 15,
    color: ui.textSubtle,
    lineHeight: 22,
  },
  bestOfferLabel: {
    alignSelf: 'flex-start',
    marginBottom: 10,
    fontSize: 13,
    fontWeight: '700',
    color: ui.primary,
  },
  offerCard: {
    backgroundColor: ui.surfaceInput,
    borderRadius: ui.radiusCard,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: ui.border,
  },
  /** Detail navigation only; keeps `OfferOffererRow` out of this Pressable. */
  offerCardTapArea: {
    alignSelf: 'stretch',
    marginHorizontal: -4,
    paddingHorizontal: 4,
    paddingBottom: 2,
    borderRadius: 10,
  },
  offerCardPressed: {
    opacity: 0.92,
    backgroundColor: ui.surfaceTintPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.primary,
  },
  offerCardMatched: {
    opacity: 0.85,
  },
  offerTapHint: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.primary,
    marginTop: 4,
  },
  offerPriceLine: {
    fontSize: 17,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 4,
  },
  offerCounterHint: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.primary,
    marginBottom: 4,
  },
  offerMessagePreview: {
    fontSize: 14,
    color: ui.textSecondary,
    lineHeight: 20,
    marginBottom: 6,
  },
  offerTime: {
    fontSize: 14,
    color: ui.textSecondary,
    marginBottom: 12,
  },
});
