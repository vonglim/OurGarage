import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
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
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { numberPadAccessoryProps } from '@/components/NumberPadKeyboardAccessory';
import { getAuthUserIdSync } from '@/lib/authUser';
import { formatHowDisplay, needsDeliveryFee } from '@/lib/deliveryFormat';
import { formatDurationDisplay } from '@/lib/durationFormat';
import { formatUsd, getNumericOfferPrice, getNumericTotalPrice, parseMoneyToNumber, sanitizeMoneyDigits } from '@/lib/money';
import {
  getRequestOwnerId,
  getRequestSupabaseRowId,
  isUuidString,
} from '@/lib/requestOwnership';
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
  const footerShows = posterCanRespond || renterCanRespond || posterCanConfirmRental;

  const handleAcceptOffer = () => {
    if (!canAcceptCurrent || !request || !offer) return;
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
    if (!footerShows || !request?.id || !offer) return;
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
    if (!posterCanConfirmRental || !request || !offer) return;
    if (!getRequestSupabaseRowId(request as Record<string, unknown>)) {
      showFeedbackToast('This request is not linked to the server. Open the request from Activity and try again.');
      return;
    }
    const priceNum = getNumericOfferPrice(offer);
    const priceLabel = formatUsd(priceNum);
    Alert.alert('Confirm rental', `Finalize this match for ${priceLabel}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm rental',
        onPress: () => {
          void (async () => {
            const r = await finalizeOfferAcceptance(offer.requestId, String(offer.id));
            if (!r.ok) {
              showFeedbackToast(
                r.error && r.error.length > 0
                  ? r.error
                  : 'Could not confirm. Check connection and try again.'
              );
              return;
            }
            // Navigation runs inside finalizeOfferAcceptance on success
          })();
        },
      },
    ]);
  };

  if (!requestIdStr || offerIdTrim.length === 0) {
    return null;
  }

  if (!request || !offer) {
    return (
      <View style={{ flex: 1 }}>
        <ScreenEntrance style={styles.entranceFillCentered}>
          <Text style={styles.muted}>Offer not found.</Text>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.textBtn}>
            <Text style={styles.textBtnLabel}>Go back</Text>
          </Pressable>
        </ScreenEntrance>
      </View>
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

  const scrollBottomPad = footerShows
    ? (renterCanRespond && isRenterOnThread ? 200 : 150) + insets.bottom
    : renterIsWaitingOwnerConfirm
      ? 120 + insets.bottom
      : 32 + insets.bottom;

  return (
    <View style={{ flex: 1, backgroundColor: ui.surfaceGrouped }}>
      <ScreenEntrance style={styles.entranceFlex}>
      <View style={{ flex: 1 }}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backHit}>
            <Text style={styles.backLabel}>‹ Back</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Offer details</Text>
          <Text style={styles.headerSub}>Review before you accept.</Text>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: 16,
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
              <Text style={styles.priceLine}>{formatUsd(getNumericOfferPrice(offer))}</Text>
              {offer.message?.trim() ? (
                <Text style={styles.offerMessageLine}>{offer.message.trim()}</Text>
              ) : (
                <Text style={styles.mutedSmall}>No message with this offer.</Text>
              )}
              <Text style={styles.currentOfferName}>
                {getOfferUserPreview(offer).name}
              </Text>
              <Text style={styles.mutedSmall}>
                {offer.lastUpdatedBy === offer.renterId
                  ? 'Total they are offering for the full rental period'
                  : 'Your proposed total for the full rental period'}
              </Text>
              <Text style={styles.timeLine}>Offered {getTimeAgo(offer.updatedAt)}</Text>
              {offer.status === 'declined' ? (
                <Text style={styles.currentOfferDeclined}>Declined</Text>
              ) : offer.status === 'pending_confirmation' ? (
                <Text style={styles.mutedSmall}>
                  {isViewerPoster
                    ? 'Renter accepted your counter — confirm the rental in the bar below.'
                    : 'You accepted the counter. Waiting for the owner to confirm.'}
                </Text>
              ) : null}
              {canAcceptCurrent ? (
                <RNPressable
                  onPress={() => {
                    console.log('ACCEPT CLICKED');
                    handleAcceptOffer();
                  }}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    styles.currentOfferAcceptBtn,
                    pressed && styles.primaryBtnPressed,
                    Platform.OS === 'web' && styles.acceptOfferPressableWeb,
                  ]}
                >
                  <Text style={styles.primaryBtnText}>Accept Offer</Text>
                </RNPressable>
              ) : null}
            </View>
          </>
        ) : null}

        <Text style={styles.sectionLabel}>Offer History</Text>
        {historyEntries.length === 0 ? (
          <Text style={styles.mutedSmall}>No older offers on this request.</Text>
        ) : (
          historyEntries.map((h) => (
            <View
              key={`${h.at}-${h.authorId}-${h.kind}`}
              style={styles.historyRow}
            >
              <Text style={styles.historyRowName} numberOfLines={1}>
                {h.kind} · {getTimeAgo(h.at)}
                {h.price != null && Number.isFinite(h.price) ? ` · ${formatUsd(h.price)}` : ''}
              </Text>
              {h.body?.trim() ? (
                <Text style={styles.historyRowMessage} numberOfLines={4}>
                  {h.body.trim()}
                </Text>
              ) : null}
            </View>
          ))
        )}

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

        {offer?.toolDescription?.trim() ? (
          <>
            <Text style={styles.sectionLabel}>Item description</Text>
            <View style={styles.card}>
              <Text style={styles.bodyMultiline}>
                {offer.toolDescription.trim()}
              </Text>
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
      </View>

      {footerShows ? (
        <View style={[styles.buttonContainer, { paddingBottom: 16 + insets.bottom }]}>
          {posterCanConfirmRental ? (
            <>
              <Pressable
                pressOpacityFeedback={false}
                haptic
                onPress={onConfirmRental}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  pressed && styles.primaryBtnPressed,
                ]}
              >
                <Text style={styles.primaryBtnText}>Confirm Rental</Text>
              </Pressable>
              <Pressable
                pressOpacityFeedback={false}
                onPress={onDecline}
                style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
              >
                <Text style={styles.secondaryBtnText}>Decline</Text>
              </Pressable>
            </>
          ) : isRenterOnThread && renterCanRespond ? (
            <>
              <Pressable
                pressOpacityFeedback={false}
                haptic
                onPress={onAcceptCounter}
                style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
              >
                <Text style={styles.primaryBtnText}>Accept Counter</Text>
              </Pressable>
              <Pressable
                pressOpacityFeedback={false}
                onPress={onCounterOfferPress}
                style={({ pressed }) => [
                  styles.counterOfferBtn,
                  pressed && styles.counterOfferBtnPressed,
                ]}
              >
                <Text style={styles.counterOfferBtnText}>Update Offer</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                pressOpacityFeedback={false}
                onPress={onCounterOfferPress}
                style={({ pressed }) => [
                  styles.counterOfferBtn,
                  pressed && styles.counterOfferBtnPressed,
                ]}
              >
                <Text style={styles.counterOfferBtnText}>Counter Offer</Text>
              </Pressable>
              {isViewerPoster ? (
                <Pressable
                  pressOpacityFeedback={false}
                  onPress={onDecline}
                  style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
                >
                  <Text style={styles.secondaryBtnText}>Decline</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      ) : null}
      </ScreenEntrance>

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
  );
}

const styles = StyleSheet.create({
  entranceFlex: {
    flex: 1,
  },
  entranceFillCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: ui.surfaceGrouped,
    paddingHorizontal: 28,
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
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
    backgroundColor: ui.surfaceGrouped,
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
    color: ui.textPrimary,
  },
  headerSub: {
    marginTop: 6,
    fontSize: 14,
    color: ui.textSecondary,
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: ui.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
    marginTop: 4,
  },
  currentOfferName: {
    fontSize: 17,
    fontWeight: '700',
    color: ui.textPrimary,
    marginTop: 4,
    marginBottom: 6,
  },
  currentOfferAcceptBtn: {
    marginTop: 16,
  },
  acceptOfferPressableWeb: {
    cursor: 'pointer' as const,
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
    fontSize: 15,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 4,
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
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    marginBottom: 18,
  },
  priceLine: {
    fontSize: 28,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 6,
  },
  offerMessageLine: {
    fontSize: 15,
    color: ui.textPrimary,
    lineHeight: 22,
    marginBottom: 10,
  },
  mutedSmall: {
    fontSize: 14,
    color: ui.textSecondary,
    lineHeight: 20,
    marginBottom: 10,
  },
  timeLine: {
    fontSize: 14,
    color: ui.textSecondary,
  },
  bodyLine: {
    fontSize: 15,
    color: ui.textPrimary,
    lineHeight: 22,
    marginBottom: 8,
  },
  bodyMultiline: {
    fontSize: 15,
    color: ui.textPrimary,
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
    padding: 16,
    backgroundColor: ui.background,
    borderTopWidth: 1,
    borderColor: ui.border,
    gap: 10,
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
