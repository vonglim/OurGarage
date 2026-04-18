import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from './components/KeyboardDismissScreen';
import { RequestMetaLines } from './components/RequestMetaLines';
import { OfferOffererRow } from './components/OfferOffererRow';
import { getOfferUserPreview, useOffersStore } from './store/offersStore';
import {
  getEffectiveRentalStatus,
  getRequestByTimestamp,
  isLeaveReviewEligible,
  showMarkRentalComplete,
} from './store/requestsStore';
import { useUserReviews } from './store/userReviewsStore';
import { openChatForRequest } from './lib/openRequestChat';
import { formatUsd, getNumericOfferPrice } from './lib/money';
import { ui } from '@/constants/appUi';

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
  const params = useLocalSearchParams<{ requestId?: string | string[] }>();
  const rawId = params.requestId;
  const requestIdStr = Array.isArray(rawId) ? rawId[0] : rawId;

  const [tick, setTick] = useState(0);
  const userReviews = useUserReviews();

  useFocusEffect(
    useCallback(() => {
      setTick((t) => t + 1);
    }, [])
  );

  const request = useMemo(() => {
    void tick;
    const id = Number(requestIdStr);
    if (!Number.isFinite(id)) return undefined;
    return getRequestByTimestamp(id);
  }, [requestIdStr, tick]);

  const requestIdNum = useMemo(() => {
    const n = Number(requestIdStr);
    return Number.isFinite(n) ? n : NaN;
  }, [requestIdStr]);

  /** Subscribe to store array only — filtered list must be `useMemo` so Zustand is not given a new [] every render. */
  const offersFromStore = useOffersStore((s) => s.offers);
  const offers = useMemo(() => {
    if (!Number.isFinite(requestIdNum)) return [];
    return offersFromStore
      .filter((o) => o.requestId === requestIdNum && !o.declined)
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [offersFromStore, requestIdNum]);

  const matched = !!request?.matched;
  const rentalStatus = request ? getEffectiveRentalStatus(request) : 'pending';
  const requestTs = request?.timestamp;
  const reviewed =
    requestTs != null && userReviews.some((r) => r.requestTimestamp === requestTs);
  const reviewType = 'renter';

  if (!requestIdStr || !Number.isFinite(Number(requestIdStr))) {
    return (
      <KeyboardDismissScreen style={styles.centered}>
        <Text style={styles.muted}>Invalid request.</Text>
      </KeyboardDismissScreen>
    );
  }

  if (!request) {
    return (
      <KeyboardDismissScreen style={styles.centered}>
        <Text style={styles.muted}>Request not found.</Text>
      </KeyboardDismissScreen>
    );
  }

  const onEditRequest = () => {
    if (request.timestamp == null || matched) return;
    router.push({
      pathname: '/request-a-tool',
      params: { editTimestamp: String(request.timestamp) },
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
    <KeyboardDismissScreen style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backHit}>
          <Text style={styles.backLabel}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Request details</Text>
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

        {!matched ? (
          <Pressable
            onPress={onEditRequest}
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
          >
            <Text style={styles.secondaryBtnText}>Edit Request</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={onMessage}
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
          >
            <Text style={styles.secondaryBtnText}>Message</Text>
          </Pressable>
        )}

        {showMarkRentalComplete(request) ? (
          <Pressable
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
              onPress={onLeaveReview}
              style={({ pressed }) => [styles.leaveReviewBtn, pressed && styles.leaveReviewBtnPressed]}
            >
              <Text style={styles.leaveReviewBtnText}>Leave Review</Text>
            </Pressable>
          )
        ) : null}

        <Text style={styles.sectionTitle}>Offers</Text>
        {offers.length === 0 ? (
          <Text style={styles.muted}>No offers yet</Text>
        ) : (
          offers.map((offer) => {
            const who = getOfferUserPreview(offer);
            return (
              <Pressable
                key={offer.timestamp}
                onPress={() => {
                  if (request.timestamp == null) return;
                  router.push({
                    pathname: '/offer-detail',
                    params: {
                      requestId: String(request.timestamp),
                      offerTimestamp: String(offer.timestamp),
                    },
                  });
                }}
                style={({ pressed }) => [
                  styles.offerCard,
                  pressed && styles.offerCardPressed,
                  matched && styles.offerCardMatched,
                ]}
              >
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
                <Text style={styles.offerPriceLine}>
                  Their total for entire duration: {formatUsd(getNumericOfferPrice(offer))}
                </Text>
                <Text style={styles.offerTime}>{getTimeAgo(offer.timestamp)}</Text>
                <Text style={styles.offerTapHint}>
                  {matched ? 'Tap for details' : 'Tap to review & accept or decline'}
                </Text>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </KeyboardDismissScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
    backgroundColor: '#F2F2F7',
  },
  backHit: {
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  backLabel: {
    fontSize: 17,
    fontWeight: '500',
    color: ui.primary,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    padding: 24,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
  },
  toolName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
    marginBottom: 6,
  },
  detailMuted: {
    fontSize: 14,
    color: '#6D6D72',
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
    fontSize: 17,
    fontWeight: '700',
    color: '#1B5E20',
    marginBottom: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    overflow: 'hidden',
  },
  detail: {
    fontSize: 15,
    color: '#404040',
    marginBottom: 6,
  },
  secondaryBtn: {
    marginTop: 18,
    alignSelf: 'stretch',
    paddingVertical: 12,
    borderRadius: ui.radiusButton,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.primary,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  secondaryBtnPressed: {
    opacity: ui.pressOpacity,
  },
  secondaryBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.primary,
  },
  primaryOutlineBtn: {
    marginTop: 12,
    alignSelf: 'stretch',
    paddingVertical: 12,
    borderRadius: ui.radiusButton,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C62828',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  primaryOutlinePressed: {
    opacity: 0.88,
  },
  primaryOutlineBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#C62828',
  },
  leaveReviewBtn: {
    marginTop: 12,
    alignSelf: 'stretch',
    paddingVertical: 12,
    borderRadius: ui.radiusButton,
    backgroundColor: ui.primary,
    alignItems: 'center',
  },
  leaveReviewBtnPressed: {
    opacity: ui.pressOpacity,
  },
  leaveReviewBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  reviewedNote: {
    marginTop: 14,
    fontSize: 14,
    fontWeight: '500',
    color: '#6D6D72',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginTop: 24,
    marginBottom: 12,
  },
  muted: {
    fontSize: 15,
    color: ui.textSubtle,
    lineHeight: 22,
  },
  offerCard: {
    backgroundColor: '#FAFAFA',
    borderRadius: ui.radiusCard,
    padding: ui.padCard,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: ui.border,
  },
  offerCardPressed: {
    opacity: 0.92,
    backgroundColor: '#F0F4FF',
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
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  offerTime: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
});
