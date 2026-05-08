import { BackHeader } from '@/components/AppHeaders';
import { Pressable } from '@/components/Pressable';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from '@/components/KeyboardDismissScreen';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { OfferOffererRow } from '@/components/OfferOffererRow';
import {
  destructiveOutlinePressed,
  outlinePrimaryPressed,
  primarySolidPressed,
  ui,
} from '@/constants/appUi';
import { useAuthUserId } from '@/lib/authUser';
import { formatHowDisplay, needsDeliveryFee } from '@/lib/deliveryFormat';
import { formatDurationDisplay } from '@/lib/durationFormat';
import { formatUsd, getNumericOfferPrice, getNumericTotalPrice } from '@/lib/money';
import { openChatForRequest } from '@/lib/openRequestChat';
import { getRequestOwnerId, isUuidString } from '@/lib/requestOwnership';
import { formatDistanceFromYou } from '@/lib/requestDistance';
import { billingDayCountForRequest, formatPerDayUsd } from '@/lib/requestPriceContext';
import { fetchOffersByRequestIdWithProfiles } from '@/lib/supabaseOffers';
import { getSupabase } from '@/lib/supabase';
import { mapSupabaseOfferRowToOffer } from '@/lib/supabaseOffers';
import { useMessageUnreadStore } from '@/store/messageUnreadStore';
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

function extractTermLine(message: string | null | undefined, label: string): string | null {
  const text = String(message ?? '');
  if (!text) return null;
  const m = text.match(new RegExp(`${label}:\\s*([^\\n]+)`, 'i'));
  const v = m?.[1]?.trim();
  return v && v.length > 0 ? v : null;
}

function parseDeliveryFeeFromOfferMessage(message: string | null | undefined): number | null {
  const text = String(message ?? '').trim();
  if (!text) return null;
  const m = text.match(/Delivery fee:\s*\$?\s*([0-9,]+(?:\.[0-9]+)?)/i);
  if (!m) return null;
  const n = Number(String(m[1]).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function offerItemPreviewLines(offer: Offer): { line1: string | null; line2: string | null } {
  const brand = extractTermLine(offer.message, 'Brand and model');
  const desc =
    extractTermLine(offer.message, 'Description') ??
    (offer.toolDescription?.trim().length ? offer.toolDescription.trim() : null);
  return { line1: brand, line2: desc };
}

function offerConditionSnippet(message: string | null | undefined): string | null {
  const line =
    message
      ?.trim()
      .split('\n')
      .map((l) => l.trim())
      .find(
        (l) =>
          !/^(terms \(optional\)|brand and model:|description:|replacement value:|delivery fee:|daily late fee)/i.test(
            l
          )
      ) ?? null;
  if (!line || line.length < 2) return null;
  return line.length > 28 ? `${line.slice(0, 26)}…` : line;
}

function dashMeta(value: unknown): string {
  if (value == null) return '—';
  const s = String(value).trim();
  return s === '' ? '—' : s;
}

export default function RequestDetailsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams() as {
    requestId?: string;
    requestTimestamp?: string;
    offerId?: string;
  };

  const requestId = params.requestId ?? '';

  const [tick, setTick] = useState(0);
  /** Mapped from Supabase `offers` rows for this request. */
  const [offers, setOffers] = useState<Offer[]>([]);
  const [requestSummaryExpanded, setRequestSummaryExpanded] = useState(true);
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

  useEffect(() => {
    if (visibleOffers.length > 0) {
      setRequestSummaryExpanded(false);
    } else {
      setRequestSummaryExpanded(true);
    }
  }, [visibleOffers.length]);

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
  const unreadByOfferId = useMessageUnreadStore((s) => s.unreadByOfferId);
  const messageThreadUnread = useMemo(() => {
    const acceptedOfferId = String(request?.acceptedOfferId ?? '').trim();
    if (!acceptedOfferId) return 0;
    return unreadByOfferId[acceptedOfferId] ?? 0;
  }, [request?.acceptedOfferId, unreadByOfferId]);
  const reviewType = 'renter';

  const goToOfferDetail = useCallback(
    (offer: Offer) => {
      if (request?.timestamp == null) return;
      router.push({
        pathname: '/offer-detail',
        params: {
          requestId: String(requestId),
          requestTimestamp: String(request.timestamp),
          offerId: String(offer.id),
        } as Record<string, string>,
      });
    },
    [request?.timestamp, requestId]
  );

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

  const onMessageMatched = () => {
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

  const deliveryFeeDisplay = useMemo(() => {
    const fee = request?.deliveryFee;
    const feeNum =
      typeof fee === 'number' && Number.isFinite(fee)
        ? fee
        : fee != null && String(fee).trim() !== ''
          ? Number(String(fee).replace(/[^0-9.]/g, ''))
          : null;
    return feeNum != null && Number.isFinite(feeNum) ? formatUsd(feeNum) : '—';
  }, [request?.deliveryFee]);

  const collapsedSummaryLine1 =
    request != null
      ? listedTotalNum != null && Number.isFinite(listedTotalNum)
        ? `${formatUsd(listedTotalNum)} • ${formatDurationDisplay(request)} • ${formatHowDisplay(request)}`
        : `${formatDurationDisplay(request)} • ${formatHowDisplay(request)}`
      : '';

  const pickupLabel = request != null ? String(request.pickupDate ?? request.when ?? '').trim() : '';
  const returnLabel = request != null ? String(request.returnDate ?? '').trim() : '';
  const collapsedSummaryLine2 =
    returnLabel && pickupLabel ? `${pickupLabel} → ${returnLabel}` : pickupLabel || '—';
  const collapsedSummaryLine3 = request != null ? dashMeta(request.location) : '—';

  const headerSubtitle = useMemo(() => {
    if (isOwner && visibleOffers.length > 0) {
      return 'Compare offers from nearby owners';
    }
    if (isOwner && ownerOpenForOffers && visibleOffers.length === 0) {
      return 'Nearby owners will respond here';
    }
    if (!isOwner && visibleOffers.length > 0) {
      return 'Track your offer on this request';
    }
    if (!isOwner) {
      return 'Equipment request';
    }
    return '';
  }, [isOwner, visibleOffers.length, ownerOpenForOffers]);

  const offersSectionTitle =
    visibleOffers.length === 0
      ? 'Offers'
      : `${visibleOffers.length} offer${visibleOffers.length === 1 ? '' : 's'} received`;

  const canToggleRequestSummary = visibleOffers.length > 0;

  return (
    <ScreenWrapper style={styles.screenWrap}>
      <KeyboardDismissScreen style={styles.screen}>
        <ScreenEntrance style={styles.entranceFlex}>
          <View style={[styles.header, { paddingTop: 8 }]}>
            <BackHeader
              title={request.toolName || 'Request'}
              onBack={() => router.back()}
              subtitle={headerSubtitle || undefined}
              rightAccessory={
                !isOwner && canMakeOffer ? (
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
                ) : isOwner && showOwnerHasOffersSummary ? (
                  <Text style={styles.headerOfferCount} numberOfLines={1}>
                    {visibleOffers.length} offer{visibleOffers.length === 1 ? '' : 's'}
                  </Text>
                ) : isOwner && showOwnerWaitingForOffers ? (
                  <Text style={styles.headerOfferCountMuted} numberOfLines={2}>
                    Waiting
                  </Text>
                ) : undefined
              }
            />
          </View>

          <ScrollView
            style={styles.container}
            contentContainerStyle={[
              styles.content,
              { paddingBottom: 40 + insets.bottom },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.sectionLabel}>{offersSectionTitle}</Text>
            {ownerOpenForOffers && visibleOffers.length > 0 ? (
              <Text style={styles.sectionHelper}>
                Compare offers, message owners, or accept an agreement.
              </Text>
            ) : null}
            {listedPerDayLine != null && visibleOffers.length > 0 ? (
              <Text style={styles.listedContextLine}>{listedPerDayLine}</Text>
            ) : null}

            {visibleOffers.length === 0 ? (
              ownerOpenForOffers ? (
                <View style={styles.offersEmptyCard}>
                  <Text style={styles.offersEmptyTitle}>No offers yet</Text>
                  <Text style={styles.offersEmptyBody}>
                    Nearby owners will appear here when they respond.
                  </Text>
                </View>
              ) : (
                <Text style={styles.muted}>No offers yet</Text>
              )
            ) : (
              visibleOffers.map((offer, index) => {
                const who = getOfferUserPreview(offer);
                const isBestOffer = index === 0;
                const offerBasePrice = getNumericOfferPrice(offer);
                const fee = request.deliveryFee;
                const feeNum =
                  typeof fee === 'number' && Number.isFinite(fee)
                    ? fee
                    : fee != null && String(fee).trim() !== ''
                      ? Number(String(fee).replace(/[^0-9.]/g, ''))
                      : null;
                const offerDeliveryFee =
                  parseDeliveryFeeFromOfferMessage(offer.message) ??
                  (needsDeliveryFee(request.how) && feeNum != null && Number.isFinite(feeNum)
                    ? feeNum
                    : 0);
                const offerTotalWithDelivery = offerBasePrice + offerDeliveryFee;
                const theirPerDay =
                  offerTotalWithDelivery > 0
                    ? formatPerDayUsd(offerTotalWithDelivery, requestDayCount)
                    : '—';
                const { line1: brandLine, line2: descLine } = offerItemPreviewLines(offer);
                const conditionChip = offerConditionSnippet(offer.message);
                const areaChip = String(request.location ?? '').trim();
                const showOwnerActions =
                  isOwner && ownerOpenForOffers && !matched && offer.status !== 'declined';
                const showRenterActions = !isOwner && !matched && visibleOffers.length > 0;

                return (
                  <View
                    key={offer.id}
                    style={[
                      styles.offerCard,
                      isBestOffer && styles.offerCardBest,
                      matched && styles.offerCardMatched,
                    ]}
                  >
                    {isBestOffer ? (
                      <View style={styles.bestValueBadge}>
                        <Text style={styles.bestValueBadgeText}>Best value</Text>
                      </View>
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

                    <View style={styles.offerPriceBlock}>
                      <Text style={styles.offerTotal}>{formatUsd(offerTotalWithDelivery)}</Text>
                      <Text style={styles.offerSubPrice}>
                        {theirPerDay} • {requestDayCount} {requestDayCount === 1 ? 'day' : 'days'}
                      </Text>
                    </View>

                    <View style={styles.chipRow}>
                      <View style={styles.chip}>
                        <Text style={styles.chipText} numberOfLines={1}>
                          {formatHowDisplay(request)}
                        </Text>
                      </View>
                      {conditionChip ? (
                        <View style={styles.chip}>
                          <Text style={styles.chipText} numberOfLines={1}>
                            {conditionChip}
                          </Text>
                        </View>
                      ) : null}
                      {areaChip ? (
                        <View style={styles.chip}>
                          <Text style={styles.chipText} numberOfLines={1}>
                            {areaChip}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    {brandLine || descLine ? (
                      <View style={styles.itemPreviewBlock}>
                        {brandLine ? (
                          <Text style={styles.itemPreviewLine} numberOfLines={1}>
                            {brandLine}
                          </Text>
                        ) : null}
                        {descLine ? (
                          <Text style={styles.itemPreviewLineMuted} numberOfLines={1}>
                            {descLine}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}

                    {requestOwnerId != null &&
                    offer.lastUpdatedBy === requestOwnerId &&
                    offer.lastUpdatedBy !== offer.renterId ? (
                      <Text style={styles.offerCounterHint}>Your last counter is shown above</Text>
                    ) : null}

                    <Text style={styles.offerTime}>{getTimeAgo(offer.updatedAt)}</Text>

                    {showOwnerActions ? (
                      <View style={styles.offerActionRow}>
                        {offer.status === 'pending' || offer.status === 'pending_confirmation' ? (
                          <Pressable
                            pressOpacityFeedback={false}
                            haptic
                            onPress={() => goToOfferDetail(offer)}
                            style={({ pressed }) => [
                              styles.actionPrimary,
                              pressed && primarySolidPressed,
                            ]}
                          >
                            <Text style={styles.actionPrimaryText}>
                              {offer.status === 'pending_confirmation' ? 'Review' : 'Accept'}
                            </Text>
                          </Pressable>
                        ) : null}
                        {offer.status === 'pending' ? (
                          <Pressable
                            pressOpacityFeedback={false}
                            haptic
                            onPress={() => goToOfferDetail(offer)}
                            style={({ pressed }) => [
                              styles.actionSecondary,
                              pressed && styles.actionSecondaryPressed,
                            ]}
                          >
                            <Text style={styles.actionSecondaryText}>Counter</Text>
                          </Pressable>
                        ) : null}
                        <Pressable
                          pressOpacityFeedback={false}
                          onPress={() => goToOfferDetail(offer)}
                          style={({ pressed }) => [
                            styles.actionTertiary,
                            pressed && styles.actionTertiaryPressed,
                          ]}
                        >
                          <Text style={styles.actionTertiaryText}>Details</Text>
                        </Pressable>
                      </View>
                    ) : showRenterActions ? (
                      <View style={styles.offerActionRow}>
                        <Pressable
                          pressOpacityFeedback={false}
                          haptic
                          onPress={() => goToOfferDetail(offer)}
                          style={({ pressed }) => [
                            styles.actionPrimary,
                            pressed && primarySolidPressed,
                          ]}
                        >
                          <Text style={styles.actionPrimaryText}>View offer</Text>
                        </Pressable>
                        <Pressable
                          pressOpacityFeedback={false}
                          onPress={() => goToOfferDetail(offer)}
                          style={({ pressed }) => [
                            styles.actionTertiary,
                            pressed && styles.actionTertiaryPressed,
                          ]}
                        >
                          <Text style={styles.actionTertiaryText}>Details</Text>
                        </Pressable>
                      </View>
                    ) : matched ? (
                      <Pressable
                        pressOpacityFeedback={false}
                        onPress={() => goToOfferDetail(offer)}
                        style={({ pressed }) => [
                          styles.actionTertiary,
                          { marginTop: 4 },
                          pressed && styles.actionTertiaryPressed,
                        ]}
                      >
                        <Text style={styles.actionTertiaryText}>View details</Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })
            )}

            <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>Request summary</Text>

            {requestSummaryExpanded ? (
              <View style={styles.summaryCard}>
                {canToggleRequestSummary ? (
                  <Pressable
                    pressOpacityFeedback={false}
                    onPress={() => setRequestSummaryExpanded(false)}
                    style={styles.summaryCollapseHeader}
                  >
                    <Text style={styles.summaryCollapseTitle}>Request summary</Text>
                    <Text style={styles.summaryCollapseChevron}>▲</Text>
                  </Pressable>
                ) : null}

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

                <Text style={styles.metaGroupLabel}>Rental</Text>
                <Text style={styles.detail}>When: {request.when || 'N/A'}</Text>
                <Text style={styles.detail}>Duration: {formatDurationDisplay(request)}</Text>
                <Text style={styles.detail}>
                  Total for entire duration:{' '}
                  {listedTotalNum != null ? formatUsd(listedTotalNum) : '—'}
                </Text>

                <Text style={styles.metaGroupLabel}>Delivery</Text>
                <Text style={styles.detail}>Delivery: {formatHowDisplay(request)}</Text>
                {needsDeliveryFee(request.how) ? (
                  <Text style={styles.detail}>Delivery fee you can pay: {deliveryFeeDisplay}</Text>
                ) : null}

                <Text style={styles.metaGroupLabel}>Location</Text>
                <Text style={styles.detail}>Listed area: {dashMeta(request.location)}</Text>
                <Text style={styles.detail}>Distance from you: {formatDistanceFromYou(request)}</Text>
                <Text style={styles.hintLine}>Exact location will be shared after match.</Text>

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
                ) : null}
              </View>
            ) : (
              <Pressable
                pressOpacityFeedback={false}
                onPress={() => setRequestSummaryExpanded(true)}
                style={({ pressed }) => [
                  styles.summaryCollapsedCard,
                  pressed && styles.summaryCollapsedPressed,
                ]}
              >
                <View style={styles.summaryCollapsedTop}>
                  <Text style={styles.summaryCollapsedTitle}>Request summary</Text>
                  <Text style={styles.summaryCollapsedChevron}>▼</Text>
                </View>
                <Text style={styles.summaryCollapsedLine}>{collapsedSummaryLine1}</Text>
                <Text style={styles.summaryCollapsedLine}>{collapsedSummaryLine2}</Text>
                <Text style={styles.summaryCollapsedLineMuted}>{collapsedSummaryLine3}</Text>
              </Pressable>
            )}

            {matched ? (
              <Pressable
                pressOpacityFeedback={false}
                onPress={onMessageMatched}
                style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
              >
                <Text style={styles.secondaryBtnText}>Message</Text>
                {messageThreadUnread > 0 ? (
                  <View style={styles.threadMessageBadge}>
                    <Text style={styles.threadMessageBadgeText}>
                      {messageThreadUnread > 99 ? '99+' : String(messageThreadUnread)}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            ) : null}

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
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
    backgroundColor: ui.surfaceGrouped,
  },
  headerMakeOfferBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: ui.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerMakeOfferBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.primaryOn,
    letterSpacing: -0.2,
  },
  headerOfferCount: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.primary,
    textAlign: 'right',
  },
  headerOfferCountMuted: {
    fontSize: 11,
    fontWeight: '600',
    color: ui.textSecondary,
    textAlign: 'right',
    lineHeight: 14,
  },
  container: {
    flex: 1,
    backgroundColor: ui.surfaceGrouped,
  },
  content: {
    paddingTop: 14,
    paddingBottom: 24,
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
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.55,
    marginBottom: 6,
  },
  sectionLabelSpaced: {
    marginTop: 20,
  },
  sectionHelper: {
    fontSize: 13,
    color: ui.textSecondary,
    lineHeight: 18,
    marginBottom: 8,
  },
  listedContextLine: {
    fontSize: 13,
    fontWeight: '600',
    color: ui.textPrimary,
    marginBottom: 10,
  },
  offersEmptyCard: {
    backgroundColor: ui.background,
    borderRadius: ui.radiusCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    padding: 16,
    marginBottom: 8,
  },
  offersEmptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 6,
  },
  offersEmptyBody: {
    fontSize: 14,
    color: ui.textSecondary,
    lineHeight: 20,
  },
  summaryCard: {
    backgroundColor: ui.background,
    borderRadius: ui.radiusCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    padding: 14,
    marginBottom: 12,
  },
  summaryCollapseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
  },
  summaryCollapseTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: ui.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  summaryCollapseChevron: {
    fontSize: 12,
    color: ui.textSecondary,
    fontWeight: '700',
  },
  summaryCollapsedCard: {
    backgroundColor: ui.background,
    borderRadius: ui.radiusCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    padding: 14,
    marginBottom: 12,
  },
  summaryCollapsedPressed: {
    opacity: 0.92,
    backgroundColor: ui.surfaceTintPrimary,
  },
  summaryCollapsedTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryCollapsedTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: ui.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  summaryCollapsedChevron: {
    fontSize: 12,
    color: ui.textSecondary,
    fontWeight: '700',
  },
  summaryCollapsedLine: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.textPrimary,
    lineHeight: 20,
  },
  summaryCollapsedLineMuted: {
    fontSize: 13,
    color: ui.textSecondary,
    marginTop: 4,
  },
  toolName: {
    fontSize: 20,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 6,
  },
  detailMuted: {
    fontSize: 14,
    color: ui.textSecondary,
    marginBottom: 6,
  },
  metaGroupLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: ui.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 6,
  },
  hintLine: {
    fontSize: 12,
    color: ui.textSecondary,
    fontStyle: 'italic',
    marginTop: 4,
    marginBottom: 4,
    lineHeight: 17,
  },
  waitingForOffersHint: {
    marginTop: 8,
    marginBottom: 2,
    fontSize: 14,
    fontWeight: '600',
    color: ui.textSecondary,
    letterSpacing: -0.1,
  },
  ownerHasOffersHint: {
    marginTop: 8,
    marginBottom: 2,
    fontSize: 15,
    fontWeight: '700',
    color: ui.primary,
    letterSpacing: -0.2,
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
    lineHeight: 22,
  },
  secondaryBtn: {
    position: 'relative',
    marginTop: 12,
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
  threadMessageBadge: {
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
  threadMessageBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
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
  muted: {
    fontSize: 15,
    color: ui.textSubtle,
    lineHeight: 22,
  },
  offerCard: {
    backgroundColor: ui.background,
    borderRadius: ui.radiusCard,
    padding: 12,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  offerCardBest: {
    borderColor: '#2E7D32',
    backgroundColor: '#F1F8F4',
    borderWidth: 1.5,
  },
  offerCardMatched: {
    opacity: 0.88,
  },
  bestValueBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E8F5E9',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(46,125,50,0.35)',
  },
  bestValueBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1B5E20',
    letterSpacing: 0.2,
  },
  offerPriceBlock: {
    marginTop: 4,
    marginBottom: 8,
  },
  offerTotal: {
    fontSize: 26,
    fontWeight: '800',
    color: ui.textPrimary,
    letterSpacing: -0.5,
  },
  offerSubPrice: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '600',
    color: ui.textSecondary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  chip: {
    borderRadius: ui.radiusChip,
    backgroundColor: ui.surfaceTintPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(11,31,58,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: '100%',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: ui.primary,
  },
  itemPreviewBlock: {
    marginBottom: 6,
  },
  itemPreviewLine: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.textPrimary,
    lineHeight: 20,
  },
  itemPreviewLineMuted: {
    fontSize: 13,
    color: ui.textSecondary,
    lineHeight: 18,
  },
  offerCounterHint: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.primary,
    marginBottom: 4,
  },
  offerTime: {
    fontSize: 12,
    color: ui.textSecondary,
    marginBottom: 6,
  },
  offerActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    marginTop: 2,
  },
  actionPrimary: {
    flexGrow: 1,
    flexBasis: '28%',
    minWidth: 88,
    backgroundColor: ui.primary,
    borderRadius: ui.radiusButton,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPrimaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.primaryOn,
  },
  actionSecondary: {
    flexGrow: 1,
    flexBasis: '28%',
    minWidth: 88,
    borderRadius: ui.radiusButton,
    borderWidth: 2,
    borderColor: ui.primary,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.background,
  },
  actionSecondaryPressed: {
    ...outlinePrimaryPressed,
  },
  actionSecondaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.primary,
  },
  actionTertiary: {
    flexGrow: 1,
    flexBasis: '28%',
    minWidth: 88,
    position: 'relative',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: ui.radiusButton,
    backgroundColor: ui.surfaceInput,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  actionTertiaryPressed: {
    opacity: 0.9,
    backgroundColor: ui.borderLight,
  },
  actionTertiaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.textPrimary,
  },
});
