import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BackHeader } from '@/components/AppHeaders';
import { numberPadAccessoryProps } from '@/components/NumberPadKeyboardAccessory';
import { Pressable } from '@/components/Pressable';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { outlinePrimaryPressed, primarySolidPressed, ui } from '@/constants/appUi';
import { getAuthUserIdSync } from '@/lib/authUser';
import {
  mergeNegotiationMessageForCounter,
} from '@/lib/counterOfferMessage';
import {
  buildSnapshotFromCounterDraft,
  hasMeaningfulNegotiationChange,
  negotiatedOfferTotals,
  negotiationChangeBullets,
  type NegotiationTermsSnapshot,
  type RequestPricingContext,
} from '@/lib/negotiationTermSnapshot';
import { formatNegotiatedDeliverySummary } from '@/lib/negotiationDelivery';
import type { NegotiationDeliveryMethod } from '@/lib/negotiationDelivery';
import { formatDurationDisplay } from '@/lib/durationFormat';
import { formatUsd, getNumericOfferPrice, parseMoneyToNumber, sanitizeMoneyDigits } from '@/lib/money';
import { isFinalDeclineRoundBeforeAction } from '@/lib/negotiationLifecycle';
import { billingDayCountForRequest } from '@/lib/requestPriceContext';
import { getRequestOwnerId, getRequestSupabaseRowId, isUuidString } from '@/lib/requestOwnership';
import {
  addPosterCounterOffer,
  addRenterCounterUpdate,
  getOfferById,
  posterCounterOffersRemainingForRenter,
  useOffersStore,
} from '@/store/offersStore';
import { showFeedbackToast } from '@/store/feedbackToastStore';
import { getEffectiveRentalStatus, getRequestBySupabaseId } from '@/store/requestsStore';

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export default function CounterOfferScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ requestId?: string | string[]; offerId?: string | string[] }>();
  const requestIdStr = (firstParam(params.requestId) ?? '').trim();
  const offerIdStr = (firstParam(params.offerId) ?? '').trim();

  const offersFromStore = useOffersStore((s) => s.offers);
  const offer = useMemo(() => {
    if (!offerIdStr) return undefined;
    return getOfferById(offerIdStr) ?? offersFromStore.find((o) => o.id === offerIdStr);
  }, [offerIdStr, offersFromStore]);

  const request = useMemo(() => {
    if (!requestIdStr || !isUuidString(requestIdStr)) return undefined;
    return getRequestBySupabaseId(requestIdStr);
  }, [requestIdStr]);

  const me = getAuthUserIdSync().trim();
  const requestOwnerId = request ? getRequestOwnerId(request as Record<string, unknown>)?.trim() ?? '' : '';
  const isPoster = requestOwnerId !== '' && requestOwnerId === me;
  const isRenter = !!offer && offer.renterId.trim() === me;

  const dayCount = useMemo(() => (request ? billingDayCountForRequest(request) : 1), [request]);
  const effectiveDayCount = Math.max(1, dayCount);

  const requestPricing = useMemo((): RequestPricingContext | null => {
    if (!request) return null;
    return {
      how: request.how,
      deliveryFee: request.deliveryFee,
      pickupDate: request.pickupDate,
      returnDate: request.returnDate,
      location: request.location,
      pickupRadiusMiles: request.pickupRadiusMiles,
    };
  }, [request]);

  const [baseDraft, setBaseDraft] = useState('');
  const [deliveryDraft, setDeliveryDraft] = useState('');
  const [negotiationDeliveryMethod, setNegotiationDeliveryMethod] =
    useState<NegotiationDeliveryMethod>('pickup');
  const [messageDraft, setMessageDraft] = useState('');
  const [initialSnapshot, setInitialSnapshot] = useState<NegotiationTermsSnapshot | null>(null);

  useEffect(() => {
    if (!offer || !request || !requestPricing) return;
    const { base, delivery, method } = negotiatedOfferTotals(offer, requestPricing);
    setNegotiationDeliveryMethod(method);
    setBaseDraft(sanitizeMoneyDigits(String(Number.isFinite(base) && base >= 0 ? base : 0)));
    setDeliveryDraft(sanitizeMoneyDigits(String(Math.max(0, delivery))));
    setMessageDraft('');
  }, [offer?.id, request?.timestamp, requestPricing]);

  const baseNum = parseMoneyToNumber(baseDraft);
  const deliveryNum =
    negotiationDeliveryMethod === 'owner_delivery' ? parseMoneyToNumber(deliveryDraft) ?? 0 : 0;
  const combinedTotal =
    baseNum != null && Number.isFinite(baseNum)
      ? Math.max(0, baseNum) +
        (negotiationDeliveryMethod === 'owner_delivery' ? Math.max(0, deliveryNum) : 0)
      : null;

  const threadSummary = useMemo(() => {
    if (!offer || !request || !requestPricing) return null;
    const { base, delivery, total, method } = negotiatedOfferTotals(offer, requestPricing);
    const daily = total / effectiveDayCount;
    return {
      total,
      daily,
      delivery,
      base,
      method,
    };
  }, [offer, request, requestPricing, effectiveDayCount]);

  const theirLatestLabel = useMemo(() => {
    if (!offer || !request) return '—';
    if (!threadSummary) return '—';
    const lastBy = String(offer.lastUpdatedBy ?? '').trim();
    if (lastBy === '' || lastBy === me) return '—';
    return formatUsd(threadSummary.total);
  }, [offer, request, threadSummary, me]);

  const posterSlotsLeft = useMemo(() => {
    if (!request || !isPoster || !offer) return 0;
    return posterCounterOffersRemainingForRenter(request.timestamp, offer.renterId);
  }, [request, isPoster, offer]);

  const canUseScreen =
    !!request &&
    !!offer &&
    !offer.negotiationLocked &&
    (isPoster || isRenter) &&
    offer.status === 'pending' &&
    getEffectiveRentalStatus(request) === 'pending' &&
    !request.matched;

  useEffect(() => {
    if (!offer || !request || !threadSummary) {
      setInitialSnapshot(null);
      return;
    }
    const baselineMerged = mergeNegotiationMessageForCounter({
      existing: offer.message,
      dailyRateBasisAmount: threadSummary.total,
      dayCount: effectiveDayCount,
      negotiationDeliveryMethod: threadSummary.method,
      negotiationDeliveryFee: threadSummary.method === 'owner_delivery' ? threadSummary.delivery : 0,
      optionalNote: '',
    });
    setInitialSnapshot(
      buildSnapshotFromCounterDraft({
        basePrice: threadSummary.base,
        negotiationDeliveryMethod: threadSummary.method,
        negotiationDeliveryFee: threadSummary.delivery,
        mergedMessage: baselineMerged,
        request: request as RequestPricingContext,
      })
    );
  }, [
    offer?.id,
    offer?.message,
    request,
    threadSummary?.base,
    threadSummary?.delivery,
    threadSummary?.total,
    threadSummary?.method,
    effectiveDayCount,
  ]);

  const counterPreviewLines = useMemo(() => {
    if (!initialSnapshot || !canUseScreen || !offer || baseNum == null || baseNum <= 0) {
      return [];
    }
    const draftTotalForLate =
      combinedTotal != null
        ? combinedTotal
        : Math.max(0, baseNum) +
          (negotiationDeliveryMethod === 'owner_delivery' ? Math.max(0, deliveryNum) : 0);
    const merged = mergeNegotiationMessageForCounter({
      existing: offer.message,
      dailyRateBasisAmount: draftTotalForLate,
      dayCount: effectiveDayCount,
      negotiationDeliveryMethod,
      negotiationDeliveryFee: Math.max(0, deliveryNum),
      optionalNote: messageDraft,
    });
    const draftSnap = buildSnapshotFromCounterDraft({
      basePrice: baseNum,
      negotiationDeliveryMethod,
      negotiationDeliveryFee: deliveryNum,
      mergedMessage: merged,
      request: request as RequestPricingContext,
    });
    return negotiationChangeBullets(initialSnapshot, draftSnap, 'outgoing');
  }, [
    initialSnapshot,
    canUseScreen,
    offer,
    request,
    baseNum,
    combinedTotal,
    deliveryNum,
    messageDraft,
    effectiveDayCount,
    negotiationDeliveryMethod,
  ]);

  const onSubmit = () => {
    if (!canUseScreen || !request || !offer || !requestIdStr) return;
    const rowId = getRequestSupabaseRowId(request as Record<string, unknown>);
    if (!rowId) {
      showFeedbackToast('This request is not linked to the server.');
      return;
    }
    if (baseNum == null || baseNum <= 0) {
      showFeedbackToast('Enter a valid rental amount.');
      return;
    }
    if (negotiationDeliveryMethod === 'owner_delivery' && deliveryNum < 0) {
      showFeedbackToast('Enter a valid delivery fee.');
      return;
    }

    const submitTotalForLate =
      combinedTotal != null
        ? combinedTotal
        : Math.max(0, baseNum) +
          (negotiationDeliveryMethod === 'owner_delivery' ? Math.max(0, deliveryNum) : 0);
    const merged = mergeNegotiationMessageForCounter({
      existing: offer.message,
      dailyRateBasisAmount: submitTotalForLate,
      dayCount: effectiveDayCount,
      negotiationDeliveryMethod,
      negotiationDeliveryFee: Math.max(0, deliveryNum),
      optionalNote: messageDraft,
    });

    if (!initialSnapshot) {
      showFeedbackToast('Could not verify your starting offer. Try again.');
      return;
    }
    const draftSnap = buildSnapshotFromCounterDraft({
      basePrice: baseNum,
      negotiationDeliveryMethod,
      negotiationDeliveryFee: deliveryNum,
      mergedMessage: merged,
      request: request as RequestPricingContext,
    });
    if (!hasMeaningfulNegotiationChange(initialSnapshot, draftSnap)) {
      showFeedbackToast(
        'Please change at least one negotiation detail before sending a counter offer.',
      );
      return;
    }

    void (async () => {
      if (isRenter) {
        const ok = await addRenterCounterUpdate(rowId, offer.id, {
          basePrice: baseNum,
          message: merged,
        });
        if (ok) {
          showFeedbackToast('Counter sent');
          router.back();
        } else {
          showFeedbackToast('Could not send counter. Check connection and try again.');
        }
        return;
      }
      if (isPoster) {
        if (posterSlotsLeft <= 0) {
          showFeedbackToast('No counter-offers left on this thread.');
          return;
        }
        const total = combinedTotal ?? baseNum;
        const ok = await addPosterCounterOffer(request.timestamp, offer.id, {
          price: total,
          message: merged,
        });
        if (ok) {
          showFeedbackToast('Counter sent');
          router.back();
        } else {
          showFeedbackToast('Could not send counter. Check connection and try again.');
        }
      }
    })();
  };

  if (!requestIdStr || !isUuidString(requestIdStr) || !offerIdStr) {
    return (
      <ScreenWrapper style={styles.screenWrap}>
        <View style={styles.centered}>
          <Text style={styles.muted}>Invalid counter offer link.</Text>
        </View>
      </ScreenWrapper>
    );
  }

  if (!request || !offer) {
    return (
      <ScreenWrapper style={styles.screenWrap}>
        <View style={styles.centered}>
          <Text style={styles.muted}>Offer or request not found.</Text>
        </View>
      </ScreenWrapper>
    );
  }

  if (!canUseScreen) {
    return (
      <ScreenWrapper style={styles.screenWrap}>
        <View style={styles.centered}>
          <Text style={styles.muted}>This offer can’t be countered right now.</Text>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper style={styles.screenWrap}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScreenEntrance style={styles.flex}>
          <View style={styles.header}>
            <BackHeader title="Counter Offer" onBack={() => router.back()} />
          </View>
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <Text style={styles.toolName}>{String(request.toolName ?? 'Request')}</Text>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Current offer</Text>
              {threadSummary ? (
                <>
                  <Text style={styles.row}>Total: {formatUsd(threadSummary.total)}</Text>
                  <Text style={styles.row}>Duration: {formatDurationDisplay(request)}</Text>
                  <Text style={styles.row}>
                    {formatNegotiatedDeliverySummary({
                      method: threadSummary.method,
                      fee:
                        threadSummary.method === 'owner_delivery' ? threadSummary.delivery : null,
                    })}
                  </Text>
                  <Text style={styles.row}>
                    Daily rate: {formatUsd(threadSummary.daily)}/day
                  </Text>
                </>
              ) : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Their latest</Text>
              <Text style={styles.rowMuted}>{theirLatestLabel}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Your counter</Text>
              <Text style={styles.label}>
                {isPoster ? 'Rental amount (excludes delivery if applicable)' : 'Rental amount (period total, excl. delivery fee)'}
              </Text>
              <View style={styles.moneyRow}>
                <Text style={styles.dollar}>$</Text>
                <TextInput
                  value={baseDraft}
                  onChangeText={(t) => setBaseDraft(sanitizeMoneyDigits(t))}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={ui.textSecondary}
                  style={styles.moneyInput}
                  {...numberPadAccessoryProps()}
                />
              </View>
              <Text style={[styles.label, styles.labelSpaced]}>Delivery method</Text>
              <View style={styles.deliveryPickRow}>
                <Pressable
                  onPress={() => setNegotiationDeliveryMethod('pickup')}
                  style={({ pressed }) => [
                    styles.deliveryPick,
                    negotiationDeliveryMethod === 'pickup' && styles.deliveryPickOn,
                    pressed && { opacity: 0.88 },
                  ]}
                  pressOpacityFeedback={false}
                >
                  <Text
                    style={[
                      styles.deliveryPickText,
                      negotiationDeliveryMethod === 'pickup' && styles.deliveryPickTextOn,
                    ]}
                  >
                    Pickup
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setNegotiationDeliveryMethod('owner_delivery')}
                  style={({ pressed }) => [
                    styles.deliveryPick,
                    negotiationDeliveryMethod === 'owner_delivery' && styles.deliveryPickOn,
                    pressed && { opacity: 0.88 },
                  ]}
                  pressOpacityFeedback={false}
                >
                  <Text
                    style={[
                      styles.deliveryPickText,
                      negotiationDeliveryMethod === 'owner_delivery' && styles.deliveryPickTextOn,
                    ]}
                  >
                    Owner delivery
                  </Text>
                </Pressable>
              </View>
              {negotiationDeliveryMethod === 'owner_delivery' ? (
                <>
                  <Text style={[styles.label, styles.labelSpaced]}>Delivery compensation (one-time)</Text>
                  <Text style={styles.deliveryCompHint}>
                    Optional logistics fee — not open-ended pricing. Use 0 for free delivery.
                  </Text>
                  <View style={styles.moneyRow}>
                    <Text style={styles.dollar}>$</Text>
                    <TextInput
                      value={deliveryDraft}
                      onChangeText={(t) => setDeliveryDraft(sanitizeMoneyDigits(t))}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={ui.textSecondary}
                      style={styles.moneyInput}
                      {...numberPadAccessoryProps()}
                    />
                  </View>
                </>
              ) : null}
              {combinedTotal != null ? (
                <Text style={styles.totalHint}>
                  Combined total: {formatUsd(combinedTotal)} •{' '}
                  {formatUsd(combinedTotal / effectiveDayCount)}/day
                </Text>
              ) : null}
              <Text style={[styles.label, styles.labelSpaced]}>Message (optional)</Text>
              <TextInput
                value={messageDraft}
                onChangeText={setMessageDraft}
                placeholder="Add a short note with your counter"
                placeholderTextColor={ui.textSecondary}
                style={styles.messageInput}
                multiline
                maxLength={500}
                textAlignVertical="top"
              />
            </View>

            {isPoster && posterSlotsLeft <= 3 ? (
              <Text style={styles.slotsHint}>Counter-offers left on this thread: {posterSlotsLeft}</Text>
            ) : null}

            {counterPreviewLines.length > 0 ? (
              <View style={styles.previewCard}>
                <Text style={styles.previewTitle}>You changed:</Text>
                {counterPreviewLines.map((line, i) => (
                  <Text key={`${i}-${line.slice(0, 24)}`} style={styles.previewBullet}>
                    • {line}
                  </Text>
                ))}
              </View>
            ) : null}

            {isFinalDeclineRoundBeforeAction(offer) || (isPoster && posterSlotsLeft === 1) ? (
              <View style={styles.finalRoundBanner}>
                <Text style={styles.finalRoundTitle}>Final negotiation round</Text>
                {isFinalDeclineRoundBeforeAction(offer) ? (
                  <Text style={styles.finalRoundBody}>
                    If this proposal is declined, the negotiation will close permanently.
                  </Text>
                ) : null}
                {isPoster && posterSlotsLeft === 1 ? (
                  <Text
                    style={[
                      styles.finalRoundBody,
                      isFinalDeclineRoundBeforeAction(offer) ? { marginTop: 8 } : null,
                    ]}
                  >
                    This is your last counter on this thread.
                  </Text>
                ) : null}
              </View>
            ) : null}

            <Pressable
              pressOpacityFeedback={false}
              haptic
              onPress={onSubmit}
              style={({ pressed }) => [styles.primaryBtn, pressed && primarySolidPressed]}
            >
              <Text style={styles.primaryBtnText}>Send counter</Text>
            </Pressable>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.cancelBtn, pressed && outlinePrimaryPressed]}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </ScreenEntrance>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  screenWrap: {
    backgroundColor: ui.surfaceGrouped,
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
    backgroundColor: ui.surfaceGrouped,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  muted: {
    fontSize: 15,
    color: ui.textSubtle,
    textAlign: 'center',
  },
  toolName: {
    fontSize: 18,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 14,
  },
  card: {
    backgroundColor: ui.background,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.45,
    marginBottom: 8,
  },
  row: {
    fontSize: 15,
    color: ui.textPrimary,
    marginBottom: 4,
    lineHeight: 21,
  },
  rowMuted: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.textPrimary,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.textPrimary,
  },
  labelSpaced: {
    marginTop: 12,
  },
  deliveryCompHint: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
    color: ui.textSecondary,
  },
  moneyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 10,
    backgroundColor: ui.surfaceInput,
    paddingLeft: 12,
    marginTop: 6,
  },
  dollar: {
    fontSize: 18,
    fontWeight: '700',
    color: ui.textPrimary,
    marginRight: 4,
  },
  moneyInput: {
    flex: 1,
    paddingVertical: 12,
    paddingRight: 12,
    fontSize: 18,
    color: ui.textPrimary,
  },
  deliveryPickRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  deliveryPick: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ui.border,
    backgroundColor: ui.surfaceInput,
    alignItems: 'center',
  },
  deliveryPickOn: {
    borderColor: ui.primary,
    backgroundColor: 'rgba(11, 31, 58, 0.06)',
  },
  deliveryPickText: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.textSecondary,
  },
  deliveryPickTextOn: {
    color: ui.primary,
  },
  totalHint: {
    marginTop: 10,
    fontSize: 13,
    color: ui.textSecondary,
  },
  messageInput: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: ui.textPrimary,
    backgroundColor: ui.surfaceInput,
    marginTop: 6,
  },
  previewCard: {
    backgroundColor: ui.surfaceTabActive,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  previewTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 6,
  },
  previewBullet: {
    fontSize: 14,
    color: ui.textSecondary,
    lineHeight: 20,
    marginBottom: 2,
  },
  finalRoundBanner: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F59E0B',
    marginBottom: 14,
  },
  finalRoundTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 6,
  },
  finalRoundBody: {
    fontSize: 14,
    color: '#78350F',
    lineHeight: 20,
  },
  slotsHint: {
    fontSize: 13,
    color: ui.textSecondary,
    marginBottom: 10,
  },
  primaryBtn: {
    backgroundColor: ui.primary,
    borderRadius: ui.radiusButton,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: {
    color: ui.primaryOn,
    fontSize: 16,
    fontWeight: '700',
  },
  cancelBtn: {
    marginTop: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: ui.radiusButton,
    borderWidth: 2,
    borderColor: ui.primary,
  },
  cancelBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: ui.primary,
  },
});
