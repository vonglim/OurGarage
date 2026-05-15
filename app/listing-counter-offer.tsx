import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { mergeNegotiationMessageForCounter } from '@/lib/counterOfferMessage';
import { billingDaysInclusive } from '@/lib/listingAvailability';
import { formatIsoDateMedium } from '@/lib/listingAvailabilityDates';
import { ownerCounterListingOffer } from '@/lib/listingOfferNegotiationActions';
import { NEGOTIATION_MAX_DECLINES_BEFORE_LOCK } from '@/lib/negotiationLifecycleConstants';
import { MAX_POSTER_COUNTER_OFFERS } from '@/lib/negotiationOfferConstants';
import { formatNegotiatedDeliverySummary, type NegotiationDeliveryMethod } from '@/lib/negotiationDelivery';
import {
  buildSnapshotFromCounterDraft,
  hasMeaningfulNegotiationChange,
  negotiationChangeBullets,
  type NegotiationTermsSnapshot,
  type RequestPricingContext,
} from '@/lib/negotiationTermSnapshot';
import { formatUsd, parseMoneyToNumber, sanitizeMoneyDigits } from '@/lib/money';
import { getSupabase } from '@/lib/supabase';
import { showFeedbackToast } from '@/store/feedbackToastStore';

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function readPrice(row: Record<string, unknown>): number {
  for (const k of ['current_price', 'price']) {
    const v = row[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

function readInt(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  return 0;
}

export default function ListingCounterOfferScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ offerId?: string | string[] }>();
  const offerIdStr = (firstParam(params.offerId) ?? '').trim();

  const [row, setRow] = useState<Record<string, unknown> | null>(null);
  const [ownerId, setOwnerId] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!offerIdStr) {
      setRow(null);
      setOwnerId('');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const sb = getSupabase();
      const { data: r, error } = await sb.from('offers').select('*').eq('id', offerIdStr).maybeSingle();
      if (error || !r) {
        setRow(null);
        setOwnerId('');
        return;
      }
      const rec = r as Record<string, unknown>;
      if (rec.listing_id == null || String(rec.listing_id).trim() === '') {
        setRow(null);
        setOwnerId('');
        return;
      }
      setRow(rec);
      const lid = typeof rec.listing_id === 'string' ? rec.listing_id.trim() : '';
      const { data: listing } = await sb.from('listings').select('user_id').eq('id', lid).maybeSingle();
      const uid =
        listing && typeof (listing as { user_id?: unknown }).user_id === 'string'
          ? String((listing as { user_id: string }).user_id).trim()
          : '';
      setOwnerId(uid);
    } finally {
      setLoading(false);
    }
  }, [offerIdStr]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const me = getAuthUserIdSync().trim();
  const isOwner = ownerId !== '' && me === ownerId;
  const renterId = row && typeof row.user_id === 'string' ? row.user_id.trim() : '';

  const rentalStart =
    row && typeof row.rental_start_date === 'string' ? row.rental_start_date.slice(0, 10) : '';
  const rentalEnd = row && typeof row.rental_end_date === 'string' ? row.rental_end_date.slice(0, 10) : '';

  const dayCount = useMemo(() => {
    if (!rentalStart || !rentalEnd) return 1;
    return Math.max(1, billingDaysInclusive(rentalStart, rentalEnd));
  }, [rentalStart, rentalEnd]);

  const requestPricing = useMemo((): RequestPricingContext | null => {
    if (!rentalStart || !rentalEnd) return null;
    return {
      pickupDate: rentalStart,
      returnDate: rentalEnd,
      location: null,
      how: null,
      deliveryFee: null,
    };
  }, [rentalStart, rentalEnd]);

  const ndm = row?.negotiation_delivery_method;
  const methodFromRow: NegotiationDeliveryMethod =
    ndm === 'owner_delivery' ? 'owner_delivery' : 'pickup';
  const feeFromRowRaw = row?.negotiation_delivery_fee;
  const feeFromRow =
    typeof feeFromRowRaw === 'number' && Number.isFinite(feeFromRowRaw) ? Math.max(0, feeFromRowRaw) : 0;

  const [baseDraft, setBaseDraft] = useState('');
  const [deliveryDraft, setDeliveryDraft] = useState('');
  const [negotiationDeliveryMethod, setNegotiationDeliveryMethod] =
    useState<NegotiationDeliveryMethod>('pickup');
  const [messageDraft, setMessageDraft] = useState('');
  const [initialSnapshot, setInitialSnapshot] = useState<NegotiationTermsSnapshot | null>(null);

  const baseFromRow = readPrice(row ?? {});
  const baseNum = parseMoneyToNumber(baseDraft);
  const deliveryNum =
    negotiationDeliveryMethod === 'owner_delivery' ? parseMoneyToNumber(deliveryDraft) ?? 0 : 0;
  const combinedTotal =
    baseNum != null && Number.isFinite(baseNum)
      ? Math.max(0, baseNum) +
        (negotiationDeliveryMethod === 'owner_delivery' ? Math.max(0, deliveryNum) : 0)
      : null;

  useEffect(() => {
    if (!row || !requestPricing) return;
    setNegotiationDeliveryMethod(methodFromRow);
    setBaseDraft(sanitizeMoneyDigits(String(Number.isFinite(baseFromRow) && baseFromRow >= 0 ? baseFromRow : 0)));
    setDeliveryDraft(sanitizeMoneyDigits(String(methodFromRow === 'owner_delivery' ? feeFromRow : 0)));
    setMessageDraft('');
  }, [row?.id, requestPricing, baseFromRow, methodFromRow, feeFromRow]);

  const threadSummary = useMemo((): {
    total: number;
    daily: number;
    delivery: number;
    base: number;
    method: NegotiationDeliveryMethod;
  } | null => {
    if (!row || !requestPricing) return null;
    const base = readPrice(row);
    const method: NegotiationDeliveryMethod =
      row.negotiation_delivery_method === 'owner_delivery' ? 'owner_delivery' : 'pickup';
    const del =
      method === 'owner_delivery'
        ? typeof row.negotiation_delivery_fee === 'number' && Number.isFinite(row.negotiation_delivery_fee)
          ? Math.max(0, row.negotiation_delivery_fee as number)
          : 0
        : 0;
    const total = base + (method === 'owner_delivery' ? del : 0);
    const daily = total / dayCount;
    return { total, daily, delivery: del, base, method };
  }, [row, requestPricing, dayCount]);

  const negotiationLocked =
    row?.negotiation_locked === true ||
    row?.negotiation_locked === 't' ||
    row?.negotiationLocked === true;
  const status = row && typeof row.status === 'string' ? row.status.trim() : '';
  const lastBy = row && typeof row.last_updated_by === 'string' ? row.last_updated_by.trim() : '';

  const canUseScreen =
    !!row &&
    !!requestPricing &&
    isOwner &&
    !negotiationLocked &&
    status === 'pending' &&
    lastBy === renterId &&
    renterId !== '';

  useEffect(() => {
    if (!row || !requestPricing || !threadSummary) {
      setInitialSnapshot(null);
      return;
    }
    const msg = typeof row.message === 'string' ? row.message : '';
    const baselineMerged = mergeNegotiationMessageForCounter({
      existing: msg,
      dailyRateBasisAmount: threadSummary.total,
      dayCount,
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
        request: requestPricing,
      })
    );
  }, [row, requestPricing, threadSummary, dayCount]);

  const counterPreviewLines = useMemo(() => {
    if (!initialSnapshot || !canUseScreen || !row || baseNum == null || baseNum <= 0 || !requestPricing) {
      return [];
    }
    const submitTotalForLate =
      combinedTotal != null
        ? combinedTotal
        : Math.max(0, baseNum) +
          (negotiationDeliveryMethod === 'owner_delivery' ? Math.max(0, deliveryNum) : 0);
    const msg = typeof row.message === 'string' ? row.message : '';
    const merged = mergeNegotiationMessageForCounter({
      existing: msg,
      dailyRateBasisAmount: submitTotalForLate,
      dayCount,
      negotiationDeliveryMethod,
      negotiationDeliveryFee: Math.max(0, deliveryNum),
      optionalNote: messageDraft,
    });
    const draftSnap = buildSnapshotFromCounterDraft({
      basePrice: baseNum,
      negotiationDeliveryMethod,
      negotiationDeliveryFee: deliveryNum,
      mergedMessage: merged,
      request: requestPricing,
    });
    return negotiationChangeBullets(initialSnapshot, draftSnap, 'outgoing');
  }, [
    initialSnapshot,
    canUseScreen,
    row,
    baseNum,
    combinedTotal,
    deliveryNum,
    messageDraft,
    dayCount,
    negotiationDeliveryMethod,
    requestPricing,
  ]);

  const posterSlotsLeft = useMemo(() => {
    if (!row) return 0;
    return Math.max(0, MAX_POSTER_COUNTER_OFFERS - readInt(row.poster_counter_count));
  }, [row]);

  const declinesLeft = useMemo(() => {
    if (!row) return 0;
    return Math.max(0, NEGOTIATION_MAX_DECLINES_BEFORE_LOCK - readInt(row.negotiation_decline_total));
  }, [row]);

  const onSubmit = () => {
    if (!canUseScreen || !row || !offerIdStr || !requestPricing) return;
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
    const msg = typeof row.message === 'string' ? row.message : '';
    const merged = mergeNegotiationMessageForCounter({
      existing: msg,
      dailyRateBasisAmount: submitTotalForLate,
      dayCount,
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
      request: requestPricing,
    });
    if (!hasMeaningfulNegotiationChange(initialSnapshot, draftSnap)) {
      showFeedbackToast('Change at least one detail before sending a counter.');
      return;
    }

    void (async () => {
      const res = await ownerCounterListingOffer({
        offerId: offerIdStr,
        basePrice: baseNum,
        message: merged,
        negotiationDelivery: {
          method: negotiationDeliveryMethod,
          fee: negotiationDeliveryMethod === 'owner_delivery' ? Math.max(0, deliveryNum) : null,
        },
      });
      if (res.ok) {
        showFeedbackToast('Counter sent');
        router.back();
      } else {
        showFeedbackToast(res.message ?? 'Could not send counter. Try again.');
      }
    })();
  };

  if (!offerIdStr) {
    return (
      <ScreenWrapper style={styles.screenWrap}>
        <View style={styles.centered}>
          <Text style={styles.muted}>Invalid link.</Text>
        </View>
      </ScreenWrapper>
    );
  }

  if (loading) {
    return (
      <ScreenWrapper style={styles.screenWrap}>
        <View style={styles.centered}>
          <Text style={styles.muted}>Loading…</Text>
        </View>
      </ScreenWrapper>
    );
  }

  if (!row || !requestPricing || !isOwner) {
    return (
      <ScreenWrapper style={styles.screenWrap}>
        <View style={styles.centered}>
          <Text style={styles.muted}>Offer not found or you don’t have access.</Text>
        </View>
      </ScreenWrapper>
    );
  }

  if (!canUseScreen) {
    return (
      <ScreenWrapper style={styles.screenWrap}>
        <View style={styles.centered}>
          <Text style={styles.muted}>You can’t counter this offer right now.</Text>
        </View>
      </ScreenWrapper>
    );
  }

  const title =
    row.listing_snapshot != null &&
    typeof row.listing_snapshot === 'object' &&
    !Array.isArray(row.listing_snapshot) &&
    typeof (row.listing_snapshot as { title?: unknown }).title === 'string'
      ? String((row.listing_snapshot as { title: string }).title).trim() || 'Listing'
      : 'Listing';

  return (
    <ScreenWrapper style={styles.screenWrap}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScreenEntrance style={styles.flex}>
          <View style={styles.header}>
            <BackHeader title="Counter listing offer" onBack={() => router.back()} />
          </View>
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <Text style={styles.toolName}>{title}</Text>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Current offer</Text>
              {threadSummary && rentalStart && rentalEnd ? (
                <>
                  <Text style={styles.row}>Rental subtotal: {formatUsd(threadSummary.base)}</Text>
                  <Text style={styles.row}>
                    Dates: {formatIsoDateMedium(rentalStart)} → {formatIsoDateMedium(rentalEnd)}
                  </Text>
                  <Text style={styles.row}>
                    {formatNegotiatedDeliverySummary({
                      method: threadSummary.method,
                      fee: threadSummary.method === 'owner_delivery' ? threadSummary.delivery : null,
                    })}
                  </Text>
                  <Text style={styles.row}>
                    Est. total: {formatUsd(threadSummary.total)} · {formatUsd(threadSummary.daily)}/day
                  </Text>
                </>
              ) : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Your counter</Text>
              <Text style={styles.label}>Rental amount (period subtotal, excl. delivery fee)</Text>
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
                  Combined total: {formatUsd(combinedTotal)} · {formatUsd(combinedTotal / dayCount)}/day
                </Text>
              ) : null}
              <Text style={[styles.label, styles.labelSpaced]}>Message (optional)</Text>
              <TextInput
                value={messageDraft}
                onChangeText={setMessageDraft}
                placeholder="Short note with your counter"
                placeholderTextColor={ui.textSecondary}
                style={styles.messageInput}
                multiline
                maxLength={500}
                textAlignVertical="top"
              />
            </View>

            {posterSlotsLeft <= 3 ? (
              <Text style={styles.slotsHint}>Counters left on this thread: {posterSlotsLeft}</Text>
            ) : null}
            {declinesLeft <= 3 ? (
              <Text style={styles.slotsHint}>Declines before close: {declinesLeft}</Text>
            ) : null}

            {counterPreviewLines.length > 0 ? (
              <View style={styles.previewCard}>
                <Text style={styles.previewTitle}>You’re changing:</Text>
                {counterPreviewLines.map((line, i) => (
                  <Text key={`${i}-${line.slice(0, 24)}`} style={styles.previewBullet}>
                    • {line}
                  </Text>
                ))}
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
  flex: { flex: 1 },
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
    color: ui.textSecondary,
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
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.textPrimary,
  },
  labelSpaced: { marginTop: 12 },
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
  deliveryPickTextOn: { color: ui.primary },
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
