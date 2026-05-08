import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable as RNPressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Pressable } from '@/components/Pressable';
import { ScreenBackButton } from '@/components/ScreenBackButton';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackHeader } from '@/components/AppHeaders';

import { numberPadAccessoryProps } from '@/components/NumberPadKeyboardAccessory';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { getAuthUserIdSync } from '@/lib/authUser';
import { formatHowDisplay, needsDeliveryFee } from '@/lib/deliveryFormat';
import { formatDurationDisplay } from '@/lib/durationFormat';
import { formatUsd, getNumericOfferPrice, parseMoneyToNumber, sanitizeMoneyDigits } from '@/lib/money';
import { parseProfileAvatar } from '@/lib/profileAvatar';
import {
  getRequestOwnerId,
  getRequestSupabaseRowId,
  isUuidString,
} from '@/lib/requestOwnership';
import { getPresetById } from '@/lib/userAvatarPresets';
import { finalizeOfferAcceptance } from '@/lib/finalizeOfferAcceptance';
import {
  addPosterCounterOffer,
  addRenterAcceptsPosterProposed,
  declineOffer,
  getOfferUserPreview,
  posterCounterOffersRemainingForRenter,
  useOffersStore,
} from '@/store/offersStore';
import { showFeedbackToast } from '@/store/feedbackToastStore';
import {
  getEffectiveRentalStatus,
  getRequestBySupabaseId,
  getRequestByTimestamp,
} from '@/store/requestsStore';
import {
  outlinePrimaryPressed,
  primarySolidPressed,
  subtleControlPressed,
  ui,
} from '@/constants/appUi';

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

function parseDeliveryFeeFromOfferMessage(message: string | null | undefined): number | null {
  const text = String(message ?? '').trim();
  if (!text) return null;
  const m = text.match(/Delivery fee:\s*\$?\s*([0-9,]+(?:\.[0-9]+)?)/i);
  if (!m) return null;
  const n = Number(String(m[1]).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function extractTermLine(message: string | null | undefined, label: string): string | null {
  const text = String(message ?? '');
  if (!text) return null;
  const m = text.match(new RegExp(`${label}:\\s*([^\\n]+)`, 'i'));
  const v = m?.[1]?.trim();
  return v && v.length > 0 ? v : null;
}

function parseMoneyFromTextLine(value: string | null): number | null {
  if (!value) return null;
  const n = Number(String(value).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export default function OfferDetailScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    requestId?: string | string[];
    offerId?: string | string[];
  }>();
  const requestIdStr = (firstParam(params.requestId) ?? '').trim();
  const offerIdStr = firstParam(params.offerId);
  const offerIdTrim = (offerIdStr ?? '').trim();
  const [tick, setTick] = useState(0);
  const [counterModalVisible, setCounterModalVisible] = useState(false);
  const [counterPriceDraft, setCounterPriceDraft] = useState('');
  const [counterMessageDraft, setCounterMessageDraft] = useState('');
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});
  const [protectionExpanded, setProtectionExpanded] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const offersFromStore = useOffersStore((s) => s.offers);

  const offer = useMemo(() => {
    if (offerIdTrim.length === 0) return undefined;
    const byId = offersFromStore.find((o) => o.id === offerIdTrim);
    if (byId) return byId;
    const ts = Number(requestIdStr);
    if (!Number.isFinite(ts)) return undefined;
    const me = getAuthUserIdSync();
    if (typeof me === 'string' && me.length > 0) {
      const m = me.trim();
      return offersFromStore.find(
        (o) => o.requestId === ts && o.renterId.trim() === m
      );
    }
    return undefined;
  }, [offerIdTrim, requestIdStr, offersFromStore]);

  useEffect(() => {
    if (viewerVisible && Array.isArray(offer?.offer_images)) {
      console.log('VIEWER IMAGES:', offer.offer_images);
    }
  }, [viewerVisible, offer?.offer_images]);

  useFocusEffect(
    useCallback(() => {
      setTick((t) => t + 1);
    }, [])
  );

  const request = useMemo(() => {
    void tick;
    if (requestIdStr) {
      if (isUuidString(requestIdStr)) {
        const u = getRequestBySupabaseId(requestIdStr);
        if (u) return u;
      }
      const n = Number(requestIdStr);
      if (Number.isFinite(n)) {
        const t = getRequestByTimestamp(n);
        if (t) return t;
      }
    }
    if (offer) return getRequestByTimestamp(offer.requestId);
    return undefined;
  }, [requestIdStr, tick, offer]);

  const posterRemaining = useMemo(() => {
    if (!offer || !request?.id) return 0;
    return posterCounterOffersRemainingForRenter(request.id, offer.renterId);
  }, [offer, request, offersFromStore]);

  const historyEntries = useMemo(() => {
    if (!offer?.messageHistory?.length) return [];
    return [...offer.messageHistory].sort((a, b) => b.at - a.at);
  }, [offer]);

  const me = getAuthUserIdSync();
  const rentalStatus = request ? getEffectiveRentalStatus(request) : 'pending';
  const matched = !!request?.matched;
  const isAcceptedOffer =
    matched &&
    request != null &&
    offer != null &&
    typeof (request as { acceptedOfferId?: string }).acceptedOfferId === 'string' &&
    (request as { acceptedOfferId: string }).acceptedOfferId === offer.id;
  const isViewerPoster =
    !!request &&
    typeof me === 'string' &&
    me.length > 0 &&
    getRequestOwnerId(request as Record<string, unknown>) === me;
  const isRenterOnThread =
    !!offer &&
    typeof me === 'string' &&
    me.length > 0 &&
    offer.renterId.trim() === me;
  const lastMoverIsMe = offer != null && offer.lastUpdatedBy === me;
  const isPosterCounter = !!(offer && isViewerPoster && offer.lastUpdatedBy === me);
  const posterCanRespond =
    !!offer &&
    isViewerPoster &&
    !lastMoverIsMe &&
    !matched &&
    rentalStatus === 'pending' &&
    offer.status === 'pending';
  const renterCanRespond =
    !!offer &&
    typeof me === 'string' &&
    me.length > 0 &&
    offer.renterId.trim() === me &&
    !lastMoverIsMe &&
    !matched &&
    rentalStatus === 'pending' &&
    offer.status === 'pending';
  const renterIsWaitingOwnerConfirm =
    !!offer &&
    isRenterOnThread &&
    !matched &&
    rentalStatus === 'pending' &&
    offer.status === 'pending_confirmation';
  const posterCanConfirmRental =
    !!offer &&
    isViewerPoster &&
    !matched &&
    rentalStatus === 'pending' &&
    offer.status === 'pending_confirmation';
  const canActOnCurrent =
    !!offer &&
    !matched &&
    rentalStatus === 'pending' &&
    offer.status !== 'declined' &&
    offer.status !== 'closed' &&
    offer.status !== 'pending_confirmation' &&
    isViewerPoster;
  const posterIdForRequest =
    request == null
      ? undefined
      : getRequestOwnerId(request as Record<string, unknown>) ??
        (typeof (request as { posterUserId?: string }).posterUserId === 'string'
          ? (request as { posterUserId: string }).posterUserId
          : undefined);
  const canAcceptCurrent = !!(
    isViewerPoster &&
    offer &&
    !matched &&
    offer.status === 'pending' &&
    rentalStatus === 'pending' &&
    offer.lastUpdatedBy === offer.renterId
  );
  const showCounterOffer =
    canActOnCurrent && offer != null && offer.lastUpdatedBy === offer.renterId;
  const posterCanManagePendingOffer =
    !!offer &&
    isViewerPoster &&
    !matched &&
    rentalStatus === 'pending' &&
    offer.status === 'pending';
  const isPendingOffer =
    !!offer &&
    !matched &&
    rentalStatus === 'pending' &&
    offer.status === 'pending';
  const showReviewerActions = isPendingOffer && isViewerPoster;
  const showModifyOfferAction = isPendingOffer && isRenterOnThread;
  const showPendingActionBar =
    !!offer &&
    !matched &&
    rentalStatus === 'pending' &&
    offer.status === 'pending';
  const footerShows = posterCanRespond || renterCanRespond || posterCanConfirmRental || canAcceptCurrent;

  const handleAcceptOffer = () => {
    if (!showReviewerActions || !request || !offer) return;
    if (!getRequestSupabaseRowId(request as Record<string, unknown>)) {
      showFeedbackToast('This request is not linked to the server. Open the request from Activity and try again.');
      return;
    }
    const priceLabel = formatUsd(getNumericOfferPrice(offer));
    const doAccept = () => {
      void (async () => {
        const r = await finalizeOfferAcceptance(offer.requestId, String(offer.id));
        if (!r.ok) {
          showFeedbackToast(
            r.error && r.error.length > 0
              ? r.error
              : 'Could not complete accept. Check connection and try again.',
          );
          return;
        }
        // Navigation runs inside finalizeOfferAcceptance on success
      })();
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(`Accept this offer for ${priceLabel}?`)) {
        doAccept();
      }
      return;
    }
    Alert.alert('Accept offer', `Accept this offer for ${priceLabel}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Accept', onPress: doAccept },
    ]);
  };

  const onDecline = () => {
    if (!request?.id || !offer) return;
    if (!isViewerPoster) {
      router.back();
      return;
    }
    Alert.alert('Decline offer?', 'You can still receive other offers on this request.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const ok = await declineOffer(request.id, offer.id);
            if (ok) router.back();
            else showFeedbackToast('Could not decline. Check connection and try again.');
          })();
        },
      },
    ]);
  };

  const closeCounterModal = () => {
    Keyboard.dismiss();
    setCounterModalVisible(false);
  };

  const openCounterModal = () => {
    if (!offer || !showCounterOffer) return;
    if (posterRemaining <= 0) {
      Alert.alert('No counters left', 'You have used the maximum number of counter-offers for this thread.');
      return;
    }
    setCounterPriceDraft(sanitizeMoneyDigits(String(getNumericOfferPrice(offer))));
    setCounterMessageDraft('');
    setCounterModalVisible(true);
  };

  const onCounterOfferPress = () => {
    if (!offer || !request) return;
    if (isViewerPoster) {
      openCounterModal();
    } else {
      const rowId = getRequestSupabaseRowId(request as Record<string, unknown>);
      if (!rowId) return;
      router.push({ pathname: '/make-offer', params: { requestId: rowId } });
    }
  };

  const submitCounter = () => {
    if (!request?.id || !offer) return;
    const n = parseMoneyToNumber(counterPriceDraft);
    if (n == null || n < 0) {
      Alert.alert(
        'Price required',
        'Enter your counter-offer total for the full rental period.',
      );
      return;
    }
    void (async () => {
      const ok = await addPosterCounterOffer(request.id, offer.id, {
        price: n,
        message: counterMessageDraft.trim(),
      });
      if (ok) {
        closeCounterModal();
        showFeedbackToast('Counter sent');
        router.back();
      } else {
        showFeedbackToast('Could not send counter. Check connection and try again.');
      }
    })();
  };

  const onAcceptCounter = () => {
    if (!offer || !renterCanRespond) return;
    void (async () => {
      const ok = await addRenterAcceptsPosterProposed(offer.id);
      if (ok) {
        showFeedbackToast('Owner will confirm the rental next.');
      } else {
        showFeedbackToast('Could not accept. Check connection and try again.');
      }
    })();
  };

  const onConfirmRental = () => {
    if (!posterCanConfirmRental || !request || !offer) {
      console.warn('Confirm rental: early exit (state does not allow confirm)', {
        posterCanConfirmRental,
        hasRequest: !!request,
        hasOffer: !!offer,
      });
      return;
    }
    if (!getRequestSupabaseRowId(request as Record<string, unknown>)) {
      showFeedbackToast('This request is not linked to the server. Open the request from Activity and try again.');
      return;
    }
    const meTrim = (typeof me === 'string' ? me : '').trim();
    const ownerId = getRequestOwnerId(request as Record<string, unknown>)?.trim() ?? '';
    if (meTrim === '' || ownerId === '' || meTrim !== ownerId) {
      console.warn('User not allowed to confirm rental', { me: meTrim, requestOwnerId: ownerId });
      showFeedbackToast('Only the request owner can confirm the rental.');
      return;
    }
    const priceNum = getNumericOfferPrice(offer);
    const priceLabel = formatUsd(priceNum);

    const runFinalize = () => {
      void (async () => {
        try {
          const r = await finalizeOfferAcceptance(offer.requestId, String(offer.id));
          if (!r.ok) {
            console.error('CONFIRM RENTAL ERROR', r.error);
            showFeedbackToast(
              r.error && r.error.length > 0
                ? r.error
                : 'Could not confirm. Check connection and try again.'
            );
            return;
          }
        } catch (e) {
          console.error('CONFIRM RENTAL ERROR', e);
          showFeedbackToast('Could not confirm. Check connection and try again.');
        }
      })();
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(`Finalize this match for ${priceLabel}?`)) {
        runFinalize();
      }
      return;
    }
    Alert.alert('Confirm rental', `Finalize this match for ${priceLabel}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm rental', onPress: runFinalize },
    ]);
  };

  if (!requestIdStr || offerIdTrim.length === 0) {
    return null;
  }

  if (!request || !offer) {
    return (
      <ScreenWrapper style={styles.screenWrap}>
        <View style={{ flex: 1 }}>
          <ScreenEntrance style={styles.entranceFillCentered}>
            <Text style={styles.muted}>Offer not found.</Text>
            <ScreenBackButton
              onPress={() => router.back()}
              style={styles.notFoundBack}
            />
          </ScreenEntrance>
        </View>
      </ScreenWrapper>
    );
  }

  const fee = request.deliveryFee;
  const feeNum =
    typeof fee === 'number' && Number.isFinite(fee)
      ? fee
      : fee != null && String(fee).trim() !== ''
        ? Number(String(fee).replace(/[^0-9.]/g, ''))
        : null;
  const offerBasePrice = getNumericOfferPrice(offer);
  const offerDeliveryFee =
    parseDeliveryFeeFromOfferMessage(offer.message) ??
    (needsDeliveryFee(request.how) && feeNum != null && Number.isFinite(feeNum) ? feeNum : 0);
  const offerTotalWithDelivery = offerBasePrice + offerDeliveryFee;
  const durationDaysNum = Math.max(1, Number((request as { durationValue?: unknown }).durationValue) || 1);
  const offerDailyRate = offerTotalWithDelivery / durationDaysNum;
  const lateFeePerDay = offerDailyRate * 1.2;
  const pickupDateLabel = String((request as { pickupDate?: unknown }).pickupDate ?? '').trim();
  const returnDateLabel = String((request as { returnDate?: unknown }).returnDate ?? '').trim();
  const brandModelText = extractTermLine(offer.message, 'Brand and model');
  const descriptionText =
    extractTermLine(offer.message, 'Description') ??
    (offer.toolDescription?.trim().length ? offer.toolDescription.trim() : null);
  const replacementValueText = extractTermLine(offer.message, 'Replacement value');
  const dailyLateFeeText = extractTermLine(offer.message, 'Daily late fee');
  const conditionLine = offer.message?.trim().split('\n').map((l) => l.trim()).find((line) =>
    !/^(terms \(optional\)|brand and model:|description:|replacement value:|delivery fee:|daily late fee)/i.test(line)
  ) ?? null;
  const currentOfferStatusNote =
    offer.status === 'declined'
      ? 'Declined'
      : offer.status === 'pending_confirmation'
        ? isViewerPoster
          ? 'Renter accepted your counter — confirm the rental in the bar below.'
          : 'You accepted the counter. Waiting for the owner to confirm.'
        : null;
  const hasCurrentOfferDetails = !!(
    offer.message?.trim() ||
    currentOfferStatusNote
  );
  const replacementValueNum = parseMoneyFromTextLine(replacementValueText);
  const estimatedPreauth = replacementValueNum != null ? Math.max(0, Math.round(replacementValueNum * 0.75)) : null;
  const offerUser = getOfferUserPreview(offer);
  const parsedOfferUserAvatar = parseProfileAvatar(offerUser.avatar);
  const offerUserPreset = parsedOfferUserAvatar.kind === 'preset' ? getPresetById(parsedOfferUserAvatar.id) : null;
  const ownerCardTitle = isViewerPoster ? 'Owner' : 'Equipment Owner';
  const ownerDistanceLabel =
    typeof (request as { pickupRadiusMiles?: unknown }).pickupRadiusMiles === 'number' &&
    Number.isFinite((request as { pickupRadiusMiles?: number }).pickupRadiusMiles)
      ? `Within ${Math.max(1, Math.round(Number((request as { pickupRadiusMiles?: number }).pickupRadiusMiles)))} miles`
      : 'Distance flexible';
  const canAcceptPendingAsPoster =
    !!offer && isViewerPoster && !matched && rentalStatus === 'pending' && offer.status === 'pending';

  const scrollBottomPad = footerShows || showPendingActionBar
    ? (renterCanRespond && isRenterOnThread ? 120 : 110) + insets.bottom
    : renterIsWaitingOwnerConfirm
      ? 120 + insets.bottom
      : 32 + insets.bottom;

  return (
    <ScreenWrapper style={styles.screenWrap}>
      <View style={{ flex: 1, backgroundColor: ui.surfaceGrouped }}>
        <ScreenEntrance style={styles.entranceFlex}>
          <View style={{ flex: 1 }}>
            <View style={[styles.header, { paddingTop: 8 }]}>
              <BackHeader title="Offer Details" onBack={() => router.back()} />
            </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingVertical: 16,
            paddingHorizontal: 0,
            paddingBottom: scrollBottomPad,
          }}
          showsVerticalScrollIndicator={true}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
        {matched ? (
          <View style={[styles.notice, styles.dealInProgressNotice]}>
            <Text style={styles.dealInProgressTitle}>Deal in progress</Text>
            <Text style={styles.dealInProgressBody}>
              This request is matched. Accept, counter, and new offers are locked.
            </Text>
          </View>
        ) : null}

        {renterIsWaitingOwnerConfirm ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              Waiting for owner confirmation. You will be notified when they confirm the rental.
            </Text>
          </View>
        ) : null}

        {posterCanConfirmRental ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              The renter accepted your counter. Confirm the rental below to match and open the
              agreement.
            </Text>
          </View>
        ) : null}

        {!isViewerPoster &&
        !isRenterOnThread &&
        !renterCanRespond &&
        rentalStatus === 'pending' &&
        !matched ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              Only the request owner can accept, decline, or counter here.
            </Text>
          </View>
        ) : null}

        {isViewerPoster && isPosterCounter && !matched ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              This is your counter-offer. It stays in the list with other offers.
            </Text>
          </View>
        ) : null}

        {offer ? (
          <>
            <Text style={styles.sectionLabel}>Current Offer</Text>
            <View style={styles.card}>
              <Text style={styles.priceLine}>{formatUsd(offerTotalWithDelivery)}</Text>
              <Text style={styles.heroSubline}>
                {formatDurationDisplay(request)} • {formatUsd(offerDailyRate)}/day
              </Text>
              <View style={styles.heroChipRow}>
                <View style={styles.heroChip}><Text style={styles.heroChipText}>{formatHowDisplay(request)}</Text></View>
                <View style={styles.heroChip}><Text style={styles.heroChipText}>{ownerDistanceLabel}</Text></View>
              </View>
            </View>

            <Text style={styles.sectionLabel}>Item Details</Text>
            <View style={styles.card}>
              {brandModelText ? <Text style={styles.bodyLine}>Brand & model: {brandModelText}</Text> : null}
              {conditionLine ? <Text style={styles.bodyLine}>Condition: {conditionLine}</Text> : null}
              {descriptionText ? <Text style={styles.bodyLine}>Description/specs: {descriptionText}</Text> : null}
            </View>

            <Text style={styles.sectionLabel}>Photos</Text>
            <View style={styles.card}>
              {Array.isArray(offer.offer_images) && offer.offer_images.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 2 }}>
                  {offer.offer_images.map((img, i) => (
                    <Pressable
                      key={i}
                      onPress={() => {
                        setViewerIndex(i);
                        setViewerVisible(true);
                      }}
                      style={{ marginRight: 10 }}
                    >
                      <Image
                        source={{ uri: img }}
                        style={{
                          width: 110,
                          height: 110,
                          borderRadius: 10,
                        }}
                        resizeMode="cover"
                      />
                    </Pressable>
                  ))}
                </ScrollView>
              ) : (
                <Text style={styles.mutedSmall}>No photos attached.</Text>
              )}
              <Text style={styles.timeLine}>Offered {getTimeAgo(offer.updatedAt)}</Text>
            </View>

            <Text style={styles.sectionLabel}>Rental Schedule</Text>
            <View style={styles.card}>
              <Text style={styles.bodyLine}>Pickup date: {pickupDateLabel || '—'}</Text>
              <Text style={styles.bodyLine}>Return date: {returnDateLabel || '—'}</Text>
              <Text style={styles.bodyLine}>Duration: {formatDurationDisplay(request)}</Text>
            </View>

            <Text style={styles.sectionLabel}>Delivery & Meetup</Text>
            <View style={styles.card}>
              <Text style={styles.bodyLine}>Delivery method: {formatHowDisplay(request)}</Text>
              {needsDeliveryFee(request.how) ? (
                <Text style={styles.bodyLine}>Delivery fee: {formatUsd(offerDeliveryFee)}</Text>
              ) : null}
              <Text style={styles.bodyLine}>
                Rental area / meetup area: {request.location?.trim() ? request.location.trim() : '—'}
              </Text>
            </View>

            <Text style={styles.sectionLabel}>Equipment Value & Terms</Text>
            <View style={styles.card}>
              <Pressable
                pressOpacityFeedback={false}
                onPress={() => setProtectionExpanded((v) => !v)}
                style={({ pressed }) => [styles.historyHeaderPressable, pressed && styles.historyRowPressed]}
              >
                <Text style={styles.sectionToggleLabel}>Equipment value & terms</Text>
                <Text style={styles.sectionToggleAction}>{protectionExpanded ? 'Hide' : 'View'}</Text>
              </Pressable>
              {protectionExpanded ? (
                <View style={styles.protectionBody}>
                  <Text style={styles.bodyLine}>Replacement value: {replacementValueText ?? '—'}</Text>
                  <Text style={styles.bodyLine}>
                    Daily late fee per day: {formatUsd(lateFeePerDay)} ({formatUsd(offerDailyRate)} + 20%)
                  </Text>
                  <Text style={styles.bodyLine}>
                    Estimated preauthorization hold: {estimatedPreauth != null ? formatUsd(estimatedPreauth) : '—'}
                  </Text>
                  <Text style={styles.mutedSmall}>
                    No charge is applied unless needed. Preauthorization holds are temporary and only used if the item is
                    returned late, damaged, materially different, or not returned.
                  </Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.sectionLabel}>{ownerCardTitle}</Text>
            <View style={styles.card}>
              <View style={styles.userCardRow}>
                <View style={[styles.userAvatar, { backgroundColor: offerUserPreset?.color ?? ui.borderLight }]}>
                  <Text style={styles.userAvatarText}>
                    {offerUserPreset?.icon?.slice(0, 1).toUpperCase() ?? offerUser.name.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.userCardMeta}>
                  <Text style={styles.currentOfferName}>{offerUser.name}</Text>
                  <Text style={styles.bodyLine}>Rating: ★ {offerUser.rating.toFixed(1)}</Text>
                  <Text style={styles.bodyLine}>Completed rentals count: —</Text>
                  <Text style={styles.bodyLine}>Response speed: —</Text>
                </View>
              </View>
            </View>
          </>
        ) : null}

        <Text style={styles.sectionLabel}>Offer History</Text>
        {hasCurrentOfferDetails ? (
          <View style={styles.historyRow}>
            <Pressable
              pressOpacityFeedback={false}
              onPress={() =>
                setExpandedHistory((prev) => ({
                  ...prev,
                  currentOfferDetails: !prev.currentOfferDetails,
                }))
              }
              style={({ pressed }) => [styles.historyHeaderPressable, pressed && styles.historyRowPressed]}
            >
              <Text style={styles.historyRowName} numberOfLines={1}>
                Current offer details
              </Text>
              <Text style={styles.historyChevron}>
                {expandedHistory.currentOfferDetails ? 'Hide' : 'View'}
              </Text>
            </Pressable>
            {expandedHistory.currentOfferDetails ? (
              <>
                {offer.message?.trim() ? (
                  <Text style={styles.historyRowMessage}>{offer.message.trim()}</Text>
                ) : null}
                {currentOfferStatusNote ? (
                  <Text style={styles.historyRowMessage}>{currentOfferStatusNote}</Text>
                ) : null}
              </>
            ) : null}
          </View>
        ) : null}
        {historyEntries.length === 0 && !hasCurrentOfferDetails ? (
          <Text style={styles.mutedSmall}>No older offers on this request.</Text>
        ) : (
          historyEntries.map((h) => (
            <View key={`${h.at}-${h.authorId}-${h.kind}`} style={styles.historyRow}>
              <Pressable
                pressOpacityFeedback={false}
                onPress={() =>
                  setExpandedHistory((prev) => {
                    const key = `${h.at}-${h.authorId}-${h.kind}`;
                    return { ...prev, [key]: !prev[key] };
                  })
                }
                style={({ pressed }) => [styles.historyHeaderPressable, pressed && styles.historyRowPressed]}
              >
                <Text style={styles.historyRowName} numberOfLines={1}>
                  {h.kind} · {getTimeAgo(h.at)}
                  {h.price != null && Number.isFinite(h.price) ? ` · ${formatUsd(h.price)}` : ''}
                </Text>
                <Text style={styles.historyChevron}>
                  {expandedHistory[`${h.at}-${h.authorId}-${h.kind}`] ? 'Hide' : 'View'}
                </Text>
              </Pressable>
              {expandedHistory[`${h.at}-${h.authorId}-${h.kind}`] && h.body?.trim() ? (
                <Text style={styles.historyRowMessage}>{h.body.trim()}</Text>
              ) : null}
            </View>
          ))
        )}

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
      </View>

      {footerShows || showPendingActionBar ? (
        <View style={[styles.buttonContainer, { paddingBottom: 12 + insets.bottom }]}>
          {showPendingActionBar ? (
            showReviewerActions ? (
              <View style={styles.footerActionRow}>
                <Pressable
                  pressOpacityFeedback={false}
                  haptic
                  onPress={handleAcceptOffer}
                  style={({ pressed }) => [
                    styles.footerActionPrimary,
                    pressed && styles.footerActionPrimaryPressed,
                  ]}
                >
                  <Text style={styles.footerActionPrimaryText}>Accept</Text>
                </Pressable>
                <Pressable
                  pressOpacityFeedback={false}
                  onPress={onCounterOfferPress}
                  style={({ pressed }) => [
                    styles.footerActionSecondary,
                    pressed && styles.footerActionSecondaryPressed,
                  ]}
                >
                  <Text style={styles.footerActionSecondaryText}>Counter</Text>
                </Pressable>
                <Pressable
                  pressOpacityFeedback={false}
                  onPress={onDecline}
                  style={({ pressed }) => [
                    styles.footerActionDecline,
                    pressed && styles.footerActionDeclinePressed,
                  ]}
                >
                  <Text style={styles.footerActionDeclineText}>Decline</Text>
                </Pressable>
              </View>
            ) : showModifyOfferAction ? (
              <Pressable
                pressOpacityFeedback={false}
                onPress={onCounterOfferPress}
                style={({ pressed }) => [
                  styles.counterOfferBtn,
                  pressed && styles.counterOfferBtnPressed,
                ]}
              >
                <Text style={styles.counterOfferBtnText}>Modify Offer</Text>
              </Pressable>
            ) : (
              <></>
            )
          ) : posterCanConfirmRental ? (
            <View style={styles.footerActionRow}>
              <Pressable
                pressOpacityFeedback={false}
                haptic
                onPress={() => {
                  onConfirmRental();
                }}
                style={({ pressed }) => [
                  styles.footerActionPrimaryWide,
                  pressed && styles.footerActionPrimaryPressed,
                ]}
              >
                <Text style={styles.footerActionPrimaryText}>Confirm Rental</Text>
              </Pressable>
              <Pressable
                pressOpacityFeedback={false}
                onPress={onDecline}
                style={({ pressed }) => [
                  styles.footerActionDecline,
                  pressed && styles.footerActionDeclinePressed,
                ]}
              >
                <Text style={styles.footerActionDeclineText}>Decline</Text>
              </Pressable>
            </View>
          ) : canAcceptCurrent || posterCanManagePendingOffer ? (
            <View style={styles.footerActionRow}>
              <Pressable
                pressOpacityFeedback={false}
                haptic
                onPress={handleAcceptOffer}
                style={({ pressed }) => [
                  styles.footerActionPrimary,
                  pressed && styles.footerActionPrimaryPressed,
                ]}
              >
                <Text style={styles.footerActionPrimaryText}>Accept</Text>
              </Pressable>
              <Pressable
                pressOpacityFeedback={false}
                onPress={onCounterOfferPress}
                style={({ pressed }) => [
                  styles.footerActionSecondary,
                  pressed && styles.footerActionSecondaryPressed,
                ]}
              >
                <Text style={styles.footerActionSecondaryText}>Counter</Text>
              </Pressable>
              <Pressable
                pressOpacityFeedback={false}
                onPress={onDecline}
                style={({ pressed }) => [
                  styles.footerActionDecline,
                  pressed && styles.footerActionDeclinePressed,
                ]}
              >
                <Text style={styles.footerActionDeclineText}>Decline</Text>
              </Pressable>
            </View>
          ) : isRenterOnThread && renterCanRespond ? (
            <View style={styles.footerActionRow}>
              <Pressable
                pressOpacityFeedback={false}
                haptic
                onPress={onAcceptCounter}
                style={({ pressed }) => [
                  styles.footerActionPrimary,
                  pressed && styles.footerActionPrimaryPressed,
                ]}
              >
                <Text style={styles.footerActionPrimaryText}>Accept Counter</Text>
              </Pressable>
              <Pressable
                pressOpacityFeedback={false}
                onPress={onCounterOfferPress}
                style={({ pressed }) => [
                  styles.footerActionSecondary,
                  pressed && styles.footerActionSecondaryPressed,
                ]}
              >
                <Text style={styles.footerActionSecondaryText}>Update Offer</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.footerActionRow}>
              <Pressable
                pressOpacityFeedback={false}
                onPress={onCounterOfferPress}
                style={({ pressed }) => [
                  styles.footerActionSecondary,
                  styles.footerActionSecondaryGrow,
                  pressed && styles.footerActionSecondaryPressed,
                ]}
              >
                <Text style={styles.footerActionSecondaryText}>Counter</Text>
              </Pressable>
              {isViewerPoster ? (
                <Pressable
                  pressOpacityFeedback={false}
                  onPress={onDecline}
                  style={({ pressed }) => [
                    styles.footerActionDecline,
                    pressed && styles.footerActionDeclinePressed,
                  ]}
                >
                  <Text style={styles.footerActionDeclineText}>Decline</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </View>
      ) : null}
      </ScreenEntrance>

      {Array.isArray(offer.offer_images) && offer.offer_images.length > 0 ? (
        <Modal
          visible={viewerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setViewerVisible(false)}
        >
          <View style={{ flex: 1, backgroundColor: 'black' }}>
            <FlatList
              style={{ flex: 1 }}
              data={offer.offer_images}
              horizontal
              pagingEnabled
              getItemLayout={(_, index) => {
                const w = Dimensions.get('window').width;
                return {
                  length: w,
                  offset: w * index,
                  index,
                };
              }}
              keyExtractor={(_, i) => String(i)}
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const index = Math.round(
                  e.nativeEvent.contentOffset.x / e.nativeEvent.layoutMeasurement.width
                );
                setViewerIndex(index);
              }}
              renderItem={({ item }) => (
                <View
                  style={{
                    width: Dimensions.get('window').width,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <Image
                    source={{ uri: item }}
                    style={{
                      width: Dimensions.get('window').width,
                      height: Dimensions.get('window').height * 0.8,
                    }}
                    resizeMode="contain"
                  />
                </View>
              )}
            />

            <Pressable
              onPress={() => setViewerVisible(false)}
              style={{
                position: 'absolute',
                top: 50,
                right: 20,
              }}
            >
              <Text style={{ color: 'white', fontSize: 18 }}>Close</Text>
            </Pressable>

            <View
              style={{
                position: 'absolute',
                bottom: 40,
                flexDirection: 'row',
                alignSelf: 'center',
              }}
            >
              {offer.offer_images.map((_, i) => (
                <View
                  key={i}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    margin: 4,
                    backgroundColor: i === viewerIndex ? 'white' : 'gray',
                  }}
                />
              ))}
            </View>
          </View>
        </Modal>
      ) : null}

      <Modal
          visible={counterModalVisible}
          transparent
          animationType="fade"
          onRequestClose={closeCounterModal}
        >
          <Pressable style={styles.counterModalBackdrop} onPress={closeCounterModal}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.counterModalKb}
            >
              <View style={styles.counterModalCard}>
                <Text style={styles.counterModalTitle}>Counter offer</Text>
                <Text style={styles.counterModalLabel}>New total price</Text>
                <View style={styles.counterModalMoneyRow}>
                  <Text style={styles.counterModalDollar}>$</Text>
                  <TextInput
                    placeholder="0"
                    placeholderTextColor={ui.textSecondary}
                    value={counterPriceDraft}
                    onChangeText={(t) => setCounterPriceDraft(sanitizeMoneyDigits(t))}
                    style={styles.counterModalMoneyInput}
                    keyboardType="decimal-pad"
                    {...numberPadAccessoryProps()}
                    returnKeyType="done"
                    blurOnSubmit
                    onSubmitEditing={() => Keyboard.dismiss()}
                  />
                </View>
                <Text style={styles.counterModalHelper}>
                  Total you are proposing for the full rental period
                </Text>
                <Text style={styles.counterModalLabel}>Message (optional)</Text>
                <TextInput
                  value={counterMessageDraft}
                  onChangeText={setCounterMessageDraft}
                  placeholder="Explain your counter-offer"
                  placeholderTextColor={ui.textSecondary}
                  style={styles.counterModalMessageInput}
                  multiline
                  maxLength={500}
                />
                <Pressable
                  pressOpacityFeedback={false}
                  haptic
                  onPress={submitCounter}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    pressed && styles.primaryBtnPressed,
                  ]}
                >
                  <Text style={styles.primaryBtnText}>Submit counter-offer</Text>
                </Pressable>
                <Pressable
                  onPress={closeCounterModal}
                  style={({ pressed }) => [styles.textBtn, pressed && styles.secondaryBtnPressed]}
                >
                  <Text style={styles.textBtnLabel}>Cancel</Text>
                </Pressable>
              </View>
            </KeyboardAvoidingView>
          </Pressable>
        </Modal>
      </View>
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
    backgroundColor: ui.surfaceGrouped,
    paddingHorizontal: 0,
  },
  screen: {
    flex: 1,
    backgroundColor: ui.surfaceGrouped,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  header: {
    paddingHorizontal: 0,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
    backgroundColor: ui.surfaceGrouped,
  },
  backHit: {
    marginBottom: 6,
  },
  notFoundBack: {
    alignSelf: 'center',
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.55,
    marginBottom: 7,
    marginTop: 2,
  },
  currentOfferName: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.textPrimary,
    marginTop: 4,
    marginBottom: 6,
  },
  currentOfferDeclined: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#C62828',
  },
  historyRow: {
    backgroundColor: ui.background,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    alignSelf: 'stretch',
  },
  historyHeaderPressable: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  historyRowFocused: {
    borderColor: ui.primary,
    backgroundColor: ui.surfaceTintPrimary,
  },
  historyRowLocked: {
    opacity: 0.88,
  },
  historyRowPressed: {
    opacity: 0.92,
  },
  historyRowName: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 2,
    flex: 1,
  },
  historyChevron: {
    fontSize: 13,
    fontWeight: '700',
    color: ui.primary,
  },
  sectionToggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: ui.textPrimary,
    flex: 1,
  },
  sectionToggleAction: {
    fontSize: 13,
    fontWeight: '600',
    color: ui.primary,
  },
  historyRowPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.textPrimary,
    marginBottom: 4,
  },
  historyRowMessage: {
    fontSize: 14,
    color: ui.textSecondary,
    lineHeight: 20,
    marginBottom: 6,
  },
  historyRowMeta: {
    fontSize: 12,
    color: ui.textSecondary,
  },
  card: {
    backgroundColor: ui.background,
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    marginBottom: 14,
  },
  priceLine: {
    fontSize: 32,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 4,
  },
  heroSubline: {
    fontSize: 15,
    fontWeight: '600',
    color: ui.textSecondary,
    marginBottom: 11,
  },
  heroChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  heroChip: {
    borderRadius: 999,
    backgroundColor: '#EEF4FF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,122,255,0.3)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  heroChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.primary,
  },
  offerMessageLine: {
    fontSize: 15,
    color: ui.textPrimary,
    lineHeight: 22,
    marginBottom: 10,
  },
  mutedSmall: {
    fontSize: 13,
    color: ui.textSecondary,
    lineHeight: 18,
    marginBottom: 8,
  },
  timeLine: {
    fontSize: 14,
    color: ui.textSecondary,
  },
  bodyLine: {
    fontSize: 15,
    color: ui.textPrimary,
    lineHeight: 21,
    marginBottom: 6,
  },
  bodyMultiline: {
    fontSize: 15,
    color: ui.textPrimary,
    lineHeight: 22,
  },
  protectionBody: {
    marginTop: 6,
    opacity: 0.92,
  },
  userCardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  userAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    fontSize: 15,
    fontWeight: '800',
    color: ui.primaryOn,
  },
  userCardMeta: {
    flex: 1,
    minWidth: 0,
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
  dealInProgressNotice: {
    backgroundColor: '#E8F5E9',
    borderColor: '#A5D6A7',
  },
  dealInProgressTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1B5E20',
    marginBottom: 6,
  },
  dealInProgressBody: {
    fontSize: 15,
    color: '#2E7D32',
    lineHeight: 22,
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 12,
    paddingHorizontal: ui.padScreenH,
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    gap: 10,
  },
  footerActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  footerActionPrimary: {
    flexGrow: 1,
    flexBasis: '28%',
    minWidth: 88,
    backgroundColor: ui.primary,
    borderRadius: ui.radiusButton,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerActionPrimaryWide: {
    flex: 1,
    minWidth: 120,
    backgroundColor: ui.primary,
    borderRadius: ui.radiusButton,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerActionPrimaryPressed: {
    ...primarySolidPressed,
  },
  footerActionPrimaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.primaryOn,
  },
  footerActionSecondary: {
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
  footerActionSecondaryGrow: {
    flexGrow: 1,
    minWidth: 120,
  },
  footerActionSecondaryPressed: {
    ...outlinePrimaryPressed,
  },
  footerActionSecondaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.primary,
  },
  footerActionDecline: {
    flexGrow: 1,
    flexBasis: '28%',
    minWidth: 88,
    backgroundColor: ui.surfaceNeutral,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  footerActionDeclinePressed: {
    ...subtleControlPressed,
  },
  footerActionDeclineText: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.textPrimary,
  },
  counterOfferBtn: {
    backgroundColor: ui.background,
    borderRadius: ui.radiusButton,
    paddingVertical: ui.padButtonV,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: ui.primary,
  },
  counterOfferBtnPressed: {
    ...outlinePrimaryPressed,
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  counterOfferBtnText: {
    color: ui.primary,
    fontSize: 17,
    fontWeight: '600',
  },
  primaryBtn: {
    backgroundColor: ui.primary,
    borderRadius: ui.radiusButton,
    paddingVertical: ui.padButtonV,
    alignItems: 'center',
  },
  primaryBtnPressed: {
    ...primarySolidPressed,
  },
  primaryBtnText: {
    color: ui.primaryOn,
    fontSize: 17,
    fontWeight: '600',
  },
  secondaryBtn: {
    backgroundColor: ui.background,
    borderRadius: ui.radiusButton,
    paddingVertical: ui.padButtonV,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  secondaryBtnPressed: {
    ...subtleControlPressed,
  },
  secondaryBtnText: {
    color: ui.textPrimary,
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
  counterModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  counterModalKb: {
    width: '100%',
  },
  counterModalCard: {
    backgroundColor: ui.background,
    borderRadius: 14,
    padding: 20,
  },
  counterModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 16,
  },
  counterModalLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: ui.textPrimary,
    marginBottom: 8,
  },
  counterModalMoneyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 10,
    backgroundColor: ui.surfaceInput,
    paddingLeft: 12,
    marginBottom: 8,
  },
  counterModalDollar: {
    fontSize: 20,
    fontWeight: '700',
    color: ui.textPrimary,
    marginRight: 4,
  },
  counterModalMoneyInput: {
    flex: 1,
    paddingVertical: 14,
    paddingRight: 12,
    fontSize: 20,
    color: ui.textPrimary,
  },
  counterModalHelper: {
    fontSize: 13,
    color: ui.textSecondary,
    lineHeight: 18,
    marginBottom: 16,
  },
  counterModalMessageInput: {
    minHeight: 88,
    maxHeight: 140,
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: ui.textPrimary,
    backgroundColor: ui.surfaceInput,
    textAlignVertical: 'top',
    marginBottom: 18,
  },
});
