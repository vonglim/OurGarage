import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from './components/KeyboardDismissScreen';
import { acceptOfferForRequest } from './store/requestsStore';
import { ui } from '@/constants/appUi';

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
    offerTimestamp?: string | string[];
    price?: string | string[];
  }>();
  const [busy, setBusy] = useState(false);

  const requestIdStr = firstParam(params.requestId);
  const offerTsStr = firstParam(params.offerTimestamp);
  const priceStr = firstParam(params.price);

  const parsed = useMemo(() => {
    const requestTs = Number(requestIdStr);
    const offerTs = Number(offerTsStr);
    const price = Number(priceStr);
    const ok =
      Number.isFinite(requestTs) &&
      Number.isFinite(offerTs) &&
      Number.isFinite(price) &&
      price >= 0;
    return ok ? { requestTs, offerTs, price } : null;
  }, [requestIdStr, offerTsStr, priceStr]);

  const onAgree = async () => {
    if (parsed == null) return;
    setBusy(true);
    try {
      acceptOfferForRequest(parsed.requestTs, parsed.offerTs, parsed.price);
      router.replace({
        pathname: '/match-summary',
        params: { requestId: String(parsed.requestTs) },
      });
    } finally {
      setBusy(false);
    }
  };

  if (parsed == null) {
    return (
      <KeyboardDismissScreen style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorBody}>We could not open the rental agreement. Please go back and try again.</Text>
        <Pressable onPress={() => router.back()} style={styles.secondaryBtn} hitSlop={12}>
          <Text style={styles.secondaryBtnText}>Go back</Text>
        </Pressable>
      </KeyboardDismissScreen>
    );
  }

  return (
    <KeyboardDismissScreen style={styles.screen}>
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
          onPress={() => void onAgree()}
          disabled={busy}
          style={({ pressed }) => [
            styles.primaryBtn,
            (pressed || busy) && styles.primaryBtnPressed,
            busy && styles.primaryBtnDisabled,
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryBtnText}>Agree & Continue</Text>
          )}
        </Pressable>
      </View>
    </KeyboardDismissScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F2F2F7',
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
    color: '#6D6D72',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
    marginBottom: 10,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
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
    color: '#1C1C1E',
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
    borderTopColor: '#E5E5EA',
    backgroundColor: '#F2F2F7',
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
    opacity: ui.pressOpacity,
  },
  primaryBtnDisabled: {
    opacity: 0.75,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
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
