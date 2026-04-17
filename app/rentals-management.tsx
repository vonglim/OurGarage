import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatUsd } from './lib/money';
import type { Offer } from './store/offersStore';
import { getOffers } from './store/offersStore';
import { getRequestByTimestamp } from './store/requestsStore';

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
      setOffers(
        [...getOffers()].sort((a, b) => b.timestamp - a.timestamp)
      );
    }, [])
  );

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backHit}>
          <Text style={styles.backLabel}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Manage Rentals</Text>
        <Text style={styles.headerSub}>
          Offers you’ve sent on tool requests (this device).
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
              Browse local requests and tap Offer Tool to submit a price for a
              request.
            </Text>
          </View>
        ) : (
          <View style={styles.listCard}>
            {offers.map((offer, index) => {
              const req = getRequestByTimestamp(offer.requestId);
              const tool =
                req && String(req.toolName ?? '').trim()
                  ? String(req.toolName).trim()
                  : 'Request';
              const isLast = index === offers.length - 1;
              return (
                <Pressable
                  key={`${offer.requestId}-${offer.timestamp}`}
                  style={({ pressed }) => [
                    styles.row,
                    !isLast && styles.rowBorder,
                    pressed && styles.rowPressed,
                  ]}
                  onPress={() =>
                    router.push({
                      pathname: '/request-details',
                      params: {
                        requestId: String(offer.requestId),
                        viewer: 'offer',
                      },
                    })
                  }
                >
                  <Text style={styles.rowTitle} numberOfLines={2}>
                    Offer · {tool}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    Your price {formatUsd(offer.price)} · {formatShortDate(offer.timestamp)}
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F2F2F7',
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
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    letterSpacing: -0.3,
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
    paddingTop: 16,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 15,
    color: '#6D6D72',
    lineHeight: 21,
  },
  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
  },
  row: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowPressed: {
    backgroundColor: '#F9F9F9',
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  rowMeta: {
    fontSize: 14,
    color: '#6D6D72',
  },
  message: {
    marginTop: 8,
    fontSize: 14,
    color: '#3A3A3C',
    lineHeight: 20,
  },
});
