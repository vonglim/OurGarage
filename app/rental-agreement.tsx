import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Pressable } from '@/components/Pressable';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from '@/components/KeyboardDismissScreen';
import { getRequestSupabaseRowId, isUuidString } from '@/lib/requestOwnership';
import { syncRequestAndOffersFromSupabase } from '@/lib/supabaseOfferSync';
import { ensureChatForAcceptedOffer } from '@/store/chatStore';
import { showFeedbackToast } from '@/store/feedbackToastStore';
import { getNumericOfferPrice } from '@/lib/money';
import { getOfferById } from '@/store/offersStore';
import { getRequestBySupabaseId, getRequestByTimestamp } from '@/store/requestsStore';
import { primarySolidPressed, ui } from '@/constants/appUi';

const POINTS = [
  'Return the item in the same condition it was in when you received it, ordinary wear excepted.',
  'If you will be late returning it, message the other person as soon as you can and agree on what happens next.',
  'You are responsible for damage beyond normal wear. Sort it out fairly with the other person.',
  'If something needs to be replaced, a reasonable guide is fair market value for a comparable used item—not the cost of a brand-new replacement unless you both agree otherwise.',
];

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export default function RentalAgreementScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    requestId?: string | string[];
    offerId?: string | string[];
    price?: string | string[];
  }>();
  const [busy, setBusy] = useState(false);

  const requestIdStr = firstParam(params.requestId);
  const offerIdStr = firstParam(params.offerId);
  const priceStr = firstParam(params.price);

  const parsed = useMemo(() => {
    const offerId = (offerIdStr ?? '').trim();
    let price = Number(priceStr);
    if (offerId.length > 0 && (!Number.isFinite(price) || price < 0)) {
      const o = getOfferById(offerId);
      if (o) price = getNumericOfferPrice(o);
    }
    if (offerId.length === 0 || !Number.isFinite(price) || price < 0) return null;
    if (requestIdStr && isUuidString(String(requestIdStr).trim())) {
      const u = getRequestBySupabaseId(String(requestIdStr).trim());
      const ts = u && typeof (u as { timestamp?: number }).timestamp === 'number' ? (u as { timestamp: number }).timestamp : null;
      if (ts == null || !Number.isFinite(ts)) return null;
      return { requestTs: ts, offerId, price } as const;
    }
    const requestTs = Number(requestIdStr);
    const ok =
      Number.isFinite(requestTs) &&
      offerId.length > 0 &&
      Number.isFinite(price) &&
      price >= 0;
    return ok ? ({ requestTs, offerId, price } as const) : null;
  }, [requestIdStr, offerIdStr, priceStr]);

  const onAgree = async () => {
    if (parsed == null) return;
    const toMatchParam =
      requestIdStr && isUuidString(String(requestIdStr).trim())
        ? String(requestIdStr).trim()
        : String(parsed.requestTs);
    const existing = getRequestByTimestamp(parsed.requestTs);
    if (existing?.matched === true) {
      showFeedbackToast('Offer accepted');
      router.replace({
        pathname: '/match-summary',
        params: { requestId: toMatchParam },
      });
      return;
    }
    setBusy(true);
    try {
      const row = getRequestByTimestamp(parsed.requestTs);
      const requestRowId = row ? getRequestSupabaseRowId(row as Record<string, unknown>) : null;
      if (requestRowId) {
        const synced = await syncRequestAndOffersFromSupabase(
          requestRowId,
          parsed.requestTs
        );
        if (!synced) {
          showFeedbackToast('Could not sync. Check connection and try again.');
          return;
        }
      }
      const after = getRequestByTimestamp(parsed.requestTs);
      if (after?.matched === true) {
        ensureChatForAcceptedOffer(parsed.requestTs, parsed.offerId);
        showFeedbackToast('Offer accepted');
        router.replace({
          pathname: '/match-summary',
          params: { requestId: toMatchParam },
        });
        return;
      }
      showFeedbackToast('This request is not matched yet. Return to the offer and complete accept there.');
    } finally {
      setBusy(false);
    }
  };

  if (parsed == null) {
    return (
      <KeyboardDismissScreen style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <ScreenEntrance style={styles.entranceFillCentered}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorBody}>We could not open the rental agreement. Please go back and try again.</Text>
          <Pressable onPress={() => router.back()} style={styles.secondaryBtn} hitSlop={12}>
            <Text style={styles.secondaryBtnText}>Go back</Text>
          </Pressable>
        </ScreenEntrance>
      </KeyboardDismissScreen>
    );
  }

  return (
    <KeyboardDismissScreen style={styles.screen}>
      <ScreenEntrance style={styles.entranceFlex}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backHit}>
          <Text style={styles.backLabel}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Rental agreement</Text>
        <Text style={styles.headerSub}>Please confirm before we show your match summary.</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 24 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionLabel}>Plain expectations</Text>
        <View style={styles.card}>
          {POINTS.map((line, i) => (
            <View key={i} style={[styles.bulletRow, i > 0 && styles.bulletRowSpaced]}>
              <Text style={styles.bulletMark}>•</Text>
              <Text style={styles.bulletText}>{line}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.note}>
          This is not a substitute for your own judgment or any contract between you and the other person.
          By continuing, you agree to try to follow these expectations in good faith.
        </Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: 16 + insets.bottom }]}>
        <Pressable
          pressOpacityFeedback={false}
          haptic
          onPress={() => void onAgree()}
          disabled={busy}
          style={({ pressed }) => [
            styles.primaryBtn,
            (pressed || busy) && styles.primaryBtnPressed,
            busy && styles.primaryBtnDisabled,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={ui.primaryOn} />
          ) : (
            <Text style={styles.primaryBtnText}>Agree & Continue</Text>
          )}
        </Pressable>
      </View>
      </ScreenEntrance>
    </KeyboardDismissScreen>
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: ui.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.35,
    marginBottom: 10,
  },
  card: {
    backgroundColor: ui.background,
    borderRadius: 14,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    marginBottom: 16,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  bulletRowSpaced: {
    marginTop: 14,
  },
  bulletMark: {
    fontSize: 16,
    lineHeight: 24,
    color: ui.primary,
    width: 22,
    fontWeight: '700',
  },
  bulletText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    color: ui.textPrimary,
  },
  note: {
    fontSize: 14,
    lineHeight: 21,
    color: ui.textSubtle,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ui.border,
    backgroundColor: ui.surfaceGrouped,
  },
  primaryBtn: {
    backgroundColor: ui.primary,
    borderRadius: ui.radiusButton,
    paddingVertical: ui.padButtonV,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  primaryBtnPressed: {
    ...primarySolidPressed,
  },
  primaryBtnDisabled: {
    opacity: 0.75,
  },
  primaryBtnText: {
    color: ui.primaryOn,
    fontSize: 17,
    fontWeight: '600',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 10,
    textAlign: 'center',
  },
  errorBody: {
    fontSize: 15,
    lineHeight: 22,
    color: ui.textSubtle,
    textAlign: 'center',
    marginBottom: 22,
  },
  secondaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  secondaryBtnText: {
    fontSize: 17,
    fontWeight: '600',
    color: ui.primary,
  },
});
