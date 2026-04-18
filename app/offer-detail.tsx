import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OfferOffererRow } from './components/OfferOffererRow';
import { formatHowDisplay, needsDeliveryFee } from './lib/deliveryFormat';
import { formatDurationDisplay } from './lib/durationFormat';
import { formatUsd, getNumericOfferPrice, getNumericTotalPrice } from './lib/money';
import {
  declineOffer,
  getOfferUserPreview,
  useOffersStore,
} from './store/offersStore';
import { getEffectiveRentalStatus, getRequestByTimestamp } from './store/requestsStore';
import { ui } from '@/constants/appUi';

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function getTimeAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const minutes = Math.floor(diffMs / (60 * 1000));
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

export default function OfferDetailScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    requestId?: string | string[];
    offerTimestamp?: string | string[];
  }>();
  const requestIdStr = firstParam(params.requestId);
  const offerTsStr = firstParam(params.offerTimestamp);
  const [tick, setTick] = useState(0);

  const requestIdNum = useMemo(() => Number(requestIdStr), [requestIdStr]);
  const offerTsNum = useMemo(() => Number(offerTsStr), [offerTsStr]);

  const offer = useOffersStore((s) =>
    Number.isFinite(requestIdNum) && Number.isFinite(offerTsNum)
      ? s.offers.find((o) => o.requestId === requestIdNum && o.timestamp === offerTsNum)
      : undefined
  );

  useFocusEffect(
    useCallback(() => {
      setTick((t) => t + 1);
    }, [])
  );

  const request = useMemo(() => {
    void tick;
    if (!Number.isFinite(requestIdNum)) return undefined;
    return getRequestByTimestamp(requestIdNum);
  }, [requestIdNum, tick]);

  const who = offer ? getOfferUserPreview(offer) : null;
  const rentalStatus = request ? getEffectiveRentalStatus(request) : 'pending';
  const matched = !!request?.matched;
  const isAcceptedOffer =
    matched &&
    request?.acceptedOfferTimestamp != null &&
    offer != null &&
    request.acceptedOfferTimestamp === offer.timestamp;
  const canAct = !!offer && !offer.declined && !matched && rentalStatus === 'pending';

  const onAccept = () => {
    if (!canAct || !request?.timestamp || !offer) return;
    const priceNum = getNumericOfferPrice(offer);
    router.push({
      pathname: '/rental-agreement',
      params: {
        requestId: String(request.timestamp),
        offerTimestamp: String(offer.timestamp),
        price: String(priceNum),
      },
    });
  };

  const onDecline = () => {
    if (!canAct || !request?.timestamp || !offer) return;
    Alert.alert('Decline offer?', 'You can still receive other offers on this request.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: () => {
          declineOffer(request.timestamp!, offer.timestamp);
          router.back();
        },
      },
    ]);
  };

  if (!requestIdStr || !offerTsStr || !Number.isFinite(requestIdNum) || !Number.isFinite(offerTsNum)) {
    return (
      <Pressable
        style={{ flex: 1 }}
        onPress={Keyboard.dismiss}
        accessible={false}
      >
        <View style={[styles.screen, styles.centered]}>
          <Text style={styles.muted}>Invalid link.</Text>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.textBtn}>
            <Text style={styles.textBtnLabel}>Go back</Text>
          </Pressable>
        </View>
      </Pressable>
    );
  }

  if (!request || !offer) {
    return (
      <Pressable
        style={{ flex: 1 }}
        onPress={Keyboard.dismiss}
        accessible={false}
      >
        <View style={[styles.screen, styles.centered]}>
          <Text style={styles.muted}>Offer not found.</Text>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.textBtn}>
            <Text style={styles.textBtnLabel}>Go back</Text>
          </Pressable>
        </View>
      </Pressable>
    );
  }

  if (offer.declined) {
    return (
      <Pressable
        style={{ flex: 1 }}
        onPress={Keyboard.dismiss}
        accessible={false}
      >
        <View style={styles.screen}>
          <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
            <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backHit}>
              <Text style={styles.backLabel}>‹ Back</Text>
            </Pressable>
            <Text style={styles.headerTitle}>Offer</Text>
          </View>
          <View style={[styles.centered, { flex: 1 }]}>
            <Text style={styles.muted}>This offer was declined.</Text>
          </View>
        </View>
      </Pressable>
    );
  }

  const listedTotal = getNumericTotalPrice(request);
  const fee = request.deliveryFee;
  const feeNum =
    typeof fee === 'number' && Number.isFinite(fee)
      ? fee
      : fee != null && String(fee).trim() !== ''
        ? Number(String(fee).replace(/[^0-9.]/g, ''))
        : null;
  const feeDisplay =
    feeNum != null && Number.isFinite(feeNum) ? formatUsd(feeNum) : '—';

  return (
    <Pressable
      style={{ flex: 1 }}
      onPress={Keyboard.dismiss}
      accessible={false}
    >
      <View style={styles.screen}>
        <View style={styles.root}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backHit}>
            <Text style={styles.backLabel}>‹ Back</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Offer details</Text>
          <Text style={styles.headerSub}>Review before you accept.</Text>
        </View>

        <ScrollView
          style={styles.scrollFlex}
          contentContainerStyle={[
            styles.scrollContentContainer,
            {
              paddingBottom: canAct ? 140 + insets.bottom : 32 + insets.bottom,
            },
          ]}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
        >
        <Text style={styles.sectionLabel}>From</Text>
        {who ? (
          <View style={styles.userCard}>
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
            <Text style={styles.profileHint}>Tap name or avatar to open profile</Text>
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>Their offer</Text>
        <View style={styles.card}>
          <Text style={styles.priceLine}>{formatUsd(getNumericOfferPrice(offer))}</Text>
          <Text style={styles.mutedSmall}>Total they are offering for the full rental period</Text>
          <Text style={styles.timeLine}>Offered {getTimeAgo(offer.timestamp)}</Text>
        </View>

        <Text style={styles.sectionLabel}>Rental period (your request)</Text>
        <View style={styles.card}>
          <Text style={styles.bodyLine}>Duration: {formatDurationDisplay(request)}</Text>
          {listedTotal != null ? (
            <Text style={styles.bodyLine}>Your listed total: {formatUsd(listedTotal)}</Text>
          ) : null}
        </View>

        <Text style={styles.sectionLabel}>Delivery & location</Text>
        <View style={styles.card}>
          <Text style={styles.bodyLine}>Delivery: {formatHowDisplay(request)}</Text>
          {needsDeliveryFee(request.how) ? (
            <Text style={styles.bodyLine}>Delivery fee (listed): {feeDisplay}</Text>
          ) : null}
          <Text style={styles.bodyLine}>
            Area: {request.location?.trim() ? request.location.trim() : '—'}
          </Text>
        </View>

        {offer.toolDescription?.trim() ? (
          <>
            <Text style={styles.sectionLabel}>Tool description</Text>
            <View style={styles.card}>
              <Text style={styles.bodyMultiline}>{offer.toolDescription.trim()}</Text>
            </View>
          </>
        ) : null}

        {matched && !isAcceptedOffer ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              This request is already matched with another offer.
            </Text>
          </View>
        ) : null}

        {isAcceptedOffer ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>You accepted this offer.</Text>
          </View>
        ) : null}
        </ScrollView>

        {canAct ? (
          <View style={[styles.buttonContainer, { paddingBottom: 16 + insets.bottom }]}>
            <Pressable
              onPress={onAccept}
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
            >
              <Text style={styles.primaryBtnText}>Accept Offer</Text>
            </Pressable>
            <Pressable
              onPress={onDecline}
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
            >
              <Text style={styles.secondaryBtnText}>Decline</Text>
            </Pressable>
          </View>
        ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  root: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
    backgroundColor: '#F2F2F7',
  },
  backHit: {
    alignSelf: 'flex-start',
    marginBottom: 6,
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
  headerSub: {
    marginTop: 6,
    fontSize: 14,
    color: '#6D6D72',
    lineHeight: 20,
  },
  scrollFlex: {
    flex: 1,
  },
  scrollContentContainer: {
    padding: 16,
    flexGrow: 1,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6D6D72',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
    marginTop: 4,
  },
  userCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
    marginBottom: 18,
  },
  profileHint: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 10,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
    marginBottom: 18,
  },
  priceLine: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    marginBottom: 6,
  },
  mutedSmall: {
    fontSize: 14,
    color: '#6D6D72',
    lineHeight: 20,
    marginBottom: 10,
  },
  timeLine: {
    fontSize: 14,
    color: '#8E8E93',
  },
  bodyLine: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
    marginBottom: 8,
  },
  bodyMultiline: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  notice: {
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FFE082',
    marginBottom: 16,
  },
  noticeText: {
    fontSize: 15,
    color: '#5D4037',
    lineHeight: 22,
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderColor: '#eee',
    gap: 10,
  },
  primaryBtn: {
    backgroundColor: ui.primary,
    borderRadius: ui.radiusButton,
    paddingVertical: ui.padButtonV,
    alignItems: 'center',
  },
  primaryBtnPressed: {
    opacity: ui.pressOpacity,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  secondaryBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: ui.radiusButton,
    paddingVertical: ui.padButtonV,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C7C7CC',
  },
  secondaryBtnPressed: {
    opacity: ui.pressOpacity,
  },
  secondaryBtnText: {
    color: '#333',
    fontSize: 17,
    fontWeight: '600',
  },
  muted: {
    fontSize: 15,
    color: ui.textSubtle,
    textAlign: 'center',
    marginBottom: 16,
  },
  textBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  textBtnLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: ui.primary,
  },
});
