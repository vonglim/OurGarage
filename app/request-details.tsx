import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RequestMetaLines } from './components/RequestMetaLines';
import { getOffersForRequest } from './store/offersStore';
import { acceptOfferForRequest, getRequestByTimestamp } from './store/requestsStore';
import { formatUsd, getNumericOfferPrice } from './lib/money';
import { ui } from '@/constants/appUi';

function getTimeAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(diffMs / (60 * 1000));
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

export default function RequestDetailsScreen() {
  const params = useLocalSearchParams<{ requestId?: string | string[] }>();
  const rawId = params.requestId;
  const requestIdStr = Array.isArray(rawId) ? rawId[0] : rawId;
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

  const offers = useMemo(() => {
    void tick;
    const id = Number(requestIdStr);
    if (!Number.isFinite(id)) return [];
    return getOffersForRequest(id);
  }, [requestIdStr, tick]);

  const matched = !!request?.matched;

  if (!requestIdStr || !Number.isFinite(Number(requestIdStr))) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Invalid request.</Text>
      </View>
    );
  }

  if (!request) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Request not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.toolName}>{request.toolName || 'No name'}</Text>
      {matched && <Text style={styles.statusMatched}>Matched</Text>}
      {matched && (
        <Text style={styles.acceptedPriceBanner}>
          Accepted total for entire duration: {formatUsd(request.acceptedPrice)}
        </Text>
      )}
      <Text style={styles.detail}>When: {request.when || 'N/A'}</Text>
      <RequestMetaLines req={request} detailStyle={styles.detail} />

      <Text style={styles.sectionTitle}>Offers</Text>
      {offers.length === 0 ? (
        <Text style={styles.muted}>No offers yet</Text>
      ) : (
        offers.map((offer) => (
          <View key={offer.timestamp} style={styles.offerCard}>
            <Text style={styles.offerLabel}>Offer received</Text>
            <Text style={styles.offerPriceLine}>
              Their total for entire duration: {formatUsd(getNumericOfferPrice(offer))}
            </Text>
            <Text style={styles.offerTime}>{getTimeAgo(offer.timestamp)}</Text>
            <Pressable
              style={({ pressed }) => [
                styles.acceptButton,
                matched && styles.acceptButtonDisabled,
                pressed && !matched && styles.acceptButtonPressed,
              ]}
              disabled={matched}
              onPress={() => {
                acceptOfferForRequest(
                  request.timestamp,
                  offer.timestamp,
                  getNumericOfferPrice(offer)
                );
                setTick((t) => t + 1);
                router.push({
                  pathname: '/match-summary',
                  params: { requestId: String(request.timestamp) },
                });
              }}
            >
              <Text
                style={[styles.acceptButtonText, matched && styles.acceptButtonTextDisabled]}
              >
                Accept Offer
              </Text>
            </Pressable>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
  },
  toolName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
    marginBottom: 8,
  },
  statusMatched: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2E7D32',
    marginBottom: 8,
  },
  acceptedPriceBanner: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1B5E20',
    marginBottom: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    overflow: 'hidden',
  },
  detail: {
    fontSize: 15,
    color: '#404040',
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginTop: 24,
    marginBottom: 12,
  },
  muted: {
    fontSize: 15,
    color: ui.textSubtle,
    lineHeight: 22,
  },
  offerCard: {
    backgroundColor: '#FAFAFA',
    borderRadius: ui.radiusCard,
    padding: ui.padCard,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: ui.border,
  },
  offerLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
    marginBottom: 4,
  },
  offerPriceLine: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  offerTime: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  acceptButton: {
    backgroundColor: ui.primary,
    paddingVertical: ui.padButtonV,
    borderRadius: ui.radiusButton,
    alignItems: 'center',
  },
  acceptButtonPressed: {
    opacity: ui.pressOpacity,
  },
  acceptButtonDisabled: {
    backgroundColor: '#CCC',
  },
  acceptButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  acceptButtonTextDisabled: {
    color: '#666',
  },
});
