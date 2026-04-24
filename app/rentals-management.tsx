import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '@/components/Pressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from '@/components/KeyboardDismissScreen';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { getRequestSupabaseRowId } from '@/lib/requestOwnership';
import { formatUsd } from '@/lib/money';
import type { Offer } from '@/store/offersStore';
import { getOffers } from '@/store/offersStore';
import { getRequestByTimestamp } from '@/store/requestsStore';

import { ui } from '@/constants/appUi';

function formatShortDate(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export default function RentalsManagementScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [offers, setOffers] = useState<Offer[]>([]);

  useFocusEffect(
    useCallback(() => {
      setOffers([...getOffers()].sort((a, b) => b.updatedAt - a.updatedAt));
    }, [])
  );

  return (
    <ScreenWrapper style={styles.screenWrap}>
      <KeyboardDismissScreen style={styles.screen}>
        <View style={[styles.header, { paddingTop: 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backHit}>
          <Text style={styles.backLabel}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Manage Rentals</Text>
        <Text style={styles.headerSub}>
          Offers you’ve sent on equipment requests (this device).
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 32 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {offers.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No rentals yet</Text>
            <Text style={styles.emptyBody}>
              Browse local requests and tap Send offer to submit a price for a
              request.
            </Text>
          </View>
        ) : (
          <View style={styles.listCard}>
            {offers.map((offer, index) => {
              const req = getRequestByTimestamp(offer.requestId);
              const detailsId = req
                ? getRequestSupabaseRowId(req as Record<string, unknown>)
                : null;
              const tool =
                req && String(req.toolName ?? '').trim()
                  ? String(req.toolName).trim()
                  : 'Request';
              const isLast = index === offers.length - 1;
              return (
                <Pressable
                  key={offer.id}
                  style={({ pressed }) => [
                    styles.row,
                    !isLast && styles.rowBorder,
                    pressed && styles.rowPressed,
                  ]}
                  onPress={() => {
                    if (!detailsId) return;
                    router.push({
                      pathname: '/request-details',
                      params: { requestId: detailsId },
                    });
                  }}
                >
                  <Text style={styles.rowTitle} numberOfLines={2}>
                    Offer · {tool}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    Your price {formatUsd(offer.currentPrice)} · {formatShortDate(offer.updatedAt)}
                  </Text>
                  {offer.message != null && offer.message !== '' ? (
                    <Text style={styles.message} numberOfLines={3}>
                      {offer.message}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
      </KeyboardDismissScreen>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  screenWrap: {
    backgroundColor: ui.surfaceGrouped,
  },
  screen: {
    flex: 1,
    backgroundColor: ui.surfaceGrouped,
  },
  header: {
    paddingHorizontal: 0,
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
    fontSize: 28,
    fontWeight: '700',
    color: ui.textPrimary,
    letterSpacing: -0.3,
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
    paddingHorizontal: 0,
    paddingTop: 16,
  },
  emptyCard: {
    backgroundColor: ui.background,
    borderRadius: 12,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: ui.textPrimary,
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 15,
    color: ui.textSecondary,
    lineHeight: 21,
  },
  listCard: {
    backgroundColor: ui.background,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  row: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowPressed: {
    backgroundColor: ui.surfaceInput,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.textPrimary,
    marginBottom: 4,
  },
  rowMeta: {
    fontSize: 14,
    color: ui.textSecondary,
  },
  message: {
    marginTop: 8,
    fontSize: 14,
    color: ui.textPrimary,
    lineHeight: 20,
  },
});
