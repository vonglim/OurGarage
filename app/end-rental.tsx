import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from './components/KeyboardDismissScreen';
import { archiveChatForRequest } from './store/chatStore';
import {
  getEffectiveRentalStatus,
  getRequestByTimestamp,
  markRequestRentalComplete,
} from './store/requestsStore';
import { ui } from '@/constants/appUi';

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export default function EndRentalScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ requestId?: string | string[] }>();
  const requestIdStr = firstParam(params.requestId);
  const [tick, setTick] = useState(0);

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

  const onComplete = () => {
    if (request?.timestamp == null) return;
    markRequestRentalComplete(request.timestamp);
    archiveChatForRequest(request.timestamp);
    router.replace({
      pathname: '/leave-review',
      params: {
        requestTimestamp: String(request.timestamp),
        type: 'renter',
      },
    });
  };

  if (!requestIdStr || !Number.isFinite(Number(requestIdStr))) {
    return (
      <KeyboardDismissScreen style={[styles.screen, styles.centered]}>
        <Text style={styles.muted}>Invalid request.</Text>
        <Pressable onPress={() => router.back()} style={styles.textBtn} hitSlop={12}>
          <Text style={styles.textBtnLabel}>Go back</Text>
        </Pressable>
      </KeyboardDismissScreen>
    );
  }

  if (!request) {
    return (
      <KeyboardDismissScreen style={[styles.screen, styles.centered]}>
        <Text style={styles.muted}>Request not found.</Text>
        <Pressable onPress={() => router.back()} style={styles.textBtn} hitSlop={12}>
          <Text style={styles.textBtnLabel}>Go back</Text>
        </Pressable>
      </KeyboardDismissScreen>
    );
  }

  if (getEffectiveRentalStatus(request) !== 'active') {
    return (
      <KeyboardDismissScreen style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.muted}>
          This rental is not active, so it cannot be completed here.
        </Text>
        <Pressable
          onPress={() =>
            router.replace({
              pathname: '/request-details',
              params: { requestId: String(request.timestamp) },
            })
          }
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
        >
          <Text style={styles.primaryBtnText}>Open request</Text>
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
        <Text style={styles.headerTitle}>End rental</Text>
        <Text style={styles.headerSub}>Confirm the return before you leave a review.</Text>
      </View>

      <View style={[styles.body, { paddingBottom: 24 + insets.bottom }]}>
        <View style={styles.card}>
          <Text style={styles.confirmLine}>Confirm item has been returned</Text>
          <Text style={styles.hint}>
            Once you complete this rental, you can leave a review for the other person.
          </Text>
        </View>

        <View style={styles.bodySpacer} />

        <Pressable
          onPress={onComplete}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
        >
          <Text style={styles.primaryBtnText}>Complete Rental</Text>
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
  body: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    justifyContent: 'space-between',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
  },
  confirmLine: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 10,
    lineHeight: 22,
  },
  hint: {
    fontSize: 14,
    color: ui.textSubtle,
    lineHeight: 20,
  },
  bodySpacer: {
    flex: 1,
    minHeight: 16,
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
  muted: {
    fontSize: 15,
    color: ui.textSubtle,
    textAlign: 'center',
    lineHeight: 22,
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
