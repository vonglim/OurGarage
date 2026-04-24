import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { numberPadAccessoryProps } from '@/components/NumberPadKeyboardAccessory';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Pressable } from '@/components/Pressable';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { ui } from '@/constants/appUi';

import { getAuthUserIdSync } from '@/lib/authUser';
import {
  formatUsd,
  getNumericTotalPrice,
  parseMoneyToNumber,
  sanitizeMoneyDigits,
} from '@/lib/money';
import {
  billingDayCountForRequest,
  formatPerDayUsd,
  suggestedOfferTotalFromListed
} from '@/lib/requestPriceContext';

import { showFeedbackToast } from '@/store/feedbackToastStore';
import {
  addOffer,
  getOfferByRequestAndRenterId,
  posterCounterOffersRemainingForRenter,
  useOffersStore
} from '@/store/offersStore';

import { isUuidString } from '@/lib/requestOwnership';
import { getRequestBySupabaseId } from '@/store/requestsStore';

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export default function MakeOfferScreen() {
  const params = useLocalSearchParams<{ requestId?: string | string[] }>();

  const requestIdStr = firstParam(params.requestId);

  const request = useMemo(() => {
    if (!requestIdStr || !isUuidString(requestIdStr)) return undefined;
    return getRequestBySupabaseId(requestIdStr);
  }, [requestIdStr]);

  const offersFromStore = useOffersStore((s) => s.offers);

  const existingForThread = useMemo(() => {
    if (!request) return undefined;
    return getOfferByRequestAndRenterId(request.timestamp, getAuthUserIdSync());
  }, [offersFromStore, request]);

  const counterOfferSlots = useMemo(() => {
    if (!request) return 0;
    return posterCounterOffersRemainingForRenter(
      request.timestamp,
      getAuthUserIdSync()
    );
  }, [offersFromStore, request]);

  const dayCount = useMemo(() => {
    if (!request) return 1;
    return billingDayCountForRequest(request);
  }, [request]);

  const listedTotal = useMemo(() => {
    if (!request) return null;
    return getNumericTotalPrice(request);
  }, [request]);

  const suggestedTotal = useMemo(() => {
    if (!listedTotal || listedTotal <= 0) return null;
    return suggestedOfferTotalFromListed(listedTotal);
  }, [listedTotal]);

  const [priceDraft, setPriceDraft] = useState('');
  const [messageDraft, setMessageDraft] = useState('');

  React.useEffect(() => {
    if (suggestedTotal != null) {
      setPriceDraft(sanitizeMoneyDigits(String(suggestedTotal)));
    }
  }, [requestIdStr, suggestedTotal]);

  const yourOfferTotal = useMemo(
    () => parseMoneyToNumber(priceDraft),
    [priceDraft]
  );

  const yourOfferPerDayLine = useMemo(() => {
    if (!yourOfferTotal || yourOfferTotal <= 0) return 'Your offer: —';
    return `Your offer: ${formatPerDayUsd(yourOfferTotal, dayCount)}`;
  }, [yourOfferTotal, dayCount]);

  const listedLine = useMemo(() => {
    if (!listedTotal || listedTotal <= 0) return 'Listed price: —';
    return `Listed at ${formatPerDayUsd(
      listedTotal,
      dayCount
    )} (total ${formatUsd(listedTotal)})`;
  }, [listedTotal, dayCount]);

  const isPoster =
    !!request &&
    request.posterUserId === getAuthUserIdSync();

  const onSubmit = () => {
    if (!request || !requestIdStr) return;

    if (isPoster) return;

    const n = parseMoneyToNumber(priceDraft);
    if (!n || n <= 0) {
      showFeedbackToast('Enter a valid offer amount');
      return;
    }
    void (async () => {
      const ok = await addOffer(request.timestamp, requestIdStr, {
        price: n,
        message: messageDraft.trim() || undefined,
      });
      if (!ok) {
        showFeedbackToast('Could not send offer. Check connection and that the request is open.');
        return;
      }
      Keyboard.dismiss();
      showFeedbackToast('Offer sent');
      router.back();
    })();
  };

  if (!requestIdStr || !isUuidString(requestIdStr)) {
    return (
      <ScreenWrapper style={styles.screenWrap}>
        <View style={[styles.screen, styles.centered]}>
          <Text style={styles.muted}>Invalid request.</Text>
        </View>
      </ScreenWrapper>
    );
  }

  if (!request) {
    return (
      <ScreenWrapper style={styles.screenWrap}>
        <View style={[styles.screen, styles.centered]}>
          <Text style={styles.muted}>Request not found.</Text>
        </View>
      </ScreenWrapper>
    );
  }

  if (existingForThread?.status === 'pending_confirmation') {
    return (
      <ScreenWrapper style={styles.screenWrap}>
        <View style={[styles.screen, styles.centered]}>
          <Text style={styles.muted}>
            You accepted a counter. Wait for the owner to confirm the rental. You can open this
            request from Activity to see the offer.
          </Text>
        </View>
      </ScreenWrapper>
    );
  }

  if (isPoster) {
    return (
      <ScreenWrapper style={styles.screenWrap}>
        <View style={[styles.screen, styles.centered]}>
          <Text style={styles.muted}>
            You can’t make an offer on your own request.
          </Text>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper style={styles.screenWrap}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <ScreenEntrance style={{ flex: 1 }}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingVertical: 20, paddingHorizontal: 0 }}
        >
          <Text style={styles.headerTitle}>Make an offer</Text>
          <Text style={styles.headerSub}>
            {String(request.toolName ?? 'Request')}
          </Text>

          <Text style={styles.context}>{listedLine}</Text>
          <Text style={styles.context}>{yourOfferPerDayLine}</Text>

          <Text style={styles.label}>Your price</Text>
          <TextInput
            value={priceDraft}
            onChangeText={(t) => setPriceDraft(sanitizeMoneyDigits(t))}
            keyboardType="decimal-pad"
            style={styles.input}
            {...numberPadAccessoryProps()}
          />

          <Text style={styles.label}>Message (optional)</Text>
          <TextInput
            value={messageDraft}
            onChangeText={setMessageDraft}
            style={[styles.input, { height: 100 }]}
            multiline
          />

          <Pressable onPress={onSubmit} style={styles.submit}>
            <Text style={styles.submitText}>Send offer</Text>
          </Pressable>
        </ScrollView>
      </ScreenEntrance>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  screenWrap: { backgroundColor: ui.background },
  screen: { flex: 1, backgroundColor: ui.background },
  scroll: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  muted: { color: ui.textSecondary },

  headerTitle: { fontSize: 22, fontWeight: '700' },
  headerSub: { fontSize: 14, marginBottom: 10 },

  context: { marginBottom: 6 },

  label: { marginTop: 16 },

  input: {
    borderWidth: 1,
    padding: 10,
    borderRadius: 8,
    marginTop: 6,
  },

  submit: {
    marginTop: 20,
    backgroundColor: ui.primary,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  submitText: { color: 'white', fontWeight: '700' },
});