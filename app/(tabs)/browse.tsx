import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from '../components/KeyboardDismissScreen';
import { MainTabFab, useMainTabFabBottomReserve } from '../components/MainTabFab';
import { formatDurationDisplay } from '../lib/durationFormat';
import { formatMilesShort, milesFromViewerToRequest } from '../lib/requestDistance';
import { getNumericTotalPrice, formatUsd } from '../lib/money';
import {
  distanceSortKeyRequest,
  isRequestActiveForBrowse,
} from '../lib/openRequestsForBrowse';
import { useRequestsStore } from '../store/requestsStore';
import type { ToolListing } from '../store/listingsStore';
import { formatListingPriceWithUnit, useListingsStore } from '../store/listingsStore';
import { cardChrome, ui } from '@/constants/appUi';

function matchesSearchRequests(req: Record<string, unknown>, q: string): boolean {
  if (!q) return true;
  const hay = [
    req.toolName,
    req.description,
    req.location,
    req.when,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

function matchesSearchListings(item: ToolListing, q: string): boolean {
  if (!q) return true;
  const hay = [item.name, item.description, item.ownerName].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}

export default function Browse() {
  const router = useRouter();
  const params = useLocalSearchParams<{ query?: string | string[]; mode?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const fabBottomReserve = useMainTabFabBottomReserve();
  const [mode, setMode] = useState('requests');
  const [searchQuery, setSearchQuery] = useState('');

  const listings = useListingsStore((s) => s.listings);
  const requests = useRequestsStore((state) => state.requests);

  useFocusEffect(
    useCallback(() => {
      const rawQ = params.query;
      const rawM = params.mode;
      const qParam = (Array.isArray(rawQ) ? rawQ[0] : rawQ) ?? '';
      const mParam = (Array.isArray(rawM) ? rawM[0] : rawM) ?? '';

      const hasQuery = qParam.trim() !== '';
      const hasMode = mParam === 'tools' || mParam === 'requests';

      if (hasQuery) setSearchQuery(qParam);
      if (hasMode) setMode(mParam);

      if (hasQuery || hasMode) {
        router.setParams({ query: '', mode: '' });
      }
    }, [params.query, params.mode, router])
  );

  const q = searchQuery.trim().toLowerCase();

  const { requestRows, requestEmpty } = useMemo(() => {
    if (mode !== 'requests') {
      return { requestRows: [] as Record<string, unknown>[], requestEmpty: '' };
    }
    const data = requests;
    const active = data.filter(isRequestActiveForBrowse);
    const filtered = q ? active.filter((r) => matchesSearchRequests(r, q)) : active;
    const sorted = [...filtered].sort(
      (a, b) => distanceSortKeyRequest(a) - distanceSortKeyRequest(b)
    );
    const empty =
      sorted.length === 0
        ? active.length === 0
          ? 'No open requests nearby right now.'
          : 'Nothing matches your search.'
        : '';
    return { requestRows: sorted, requestEmpty: empty };
  }, [mode, q, requests]);

  const { toolRows, toolEmpty } = useMemo(() => {
    const filtered = q ? listings.filter((l) => matchesSearchListings(l, q)) : [...listings];
    filtered.sort((a, b) => a.distance - b.distance);
    const empty =
      filtered.length === 0
        ? listings.length === 0
          ? 'No equipment listed yet.'
          : 'Nothing matches your search.'
        : '';
    return { toolRows: filtered, toolEmpty: empty };
  }, [listings, q]);

  return (
    <KeyboardDismissScreen style={styles.root}>
      <View style={styles.screenInner}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={[
            styles.content,
            { paddingTop: 16 + insets.top, paddingBottom: fabBottomReserve },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.screenTitle}>Browse</Text>

          <View style={styles.segment}>
            <Pressable
              onPress={() => setMode('requests')}
              style={({ pressed }) => [
                styles.segmentItem,
                mode === 'requests' && styles.segmentItemActive,
                pressed && styles.segmentPressed,
              ]}
            >
              <Text style={[styles.segmentLabel, mode === 'requests' && styles.segmentLabelActive]}>
                Requests
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMode('tools')}
              style={({ pressed }) => [
                styles.segmentItem,
                mode === 'tools' && styles.segmentItemActive,
                pressed && styles.segmentPressed,
              ]}
            >
              <Text style={[styles.segmentLabel, mode === 'tools' && styles.segmentLabelActive]}>
                Equipment
              </Text>
            </Pressable>
          </View>

          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search equipment"
            placeholderTextColor="#8E8E93"
            style={styles.searchInput}
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCorrect={false}
            autoCapitalize="none"
          />

          {mode === 'requests' ? (
            requestRows.length === 0 ? (
              <Text style={styles.emptyText}>{requestEmpty}</Text>
            ) : (
              requestRows.map((req, idx) => {
                const ts = req.timestamp as number | undefined;
                const title = String(req.toolName ?? '').trim() || 'Request';
                const desc = String(req.description ?? '').trim();
                const distMi = milesFromViewerToRequest(req as never);
                const distLabel = formatMilesShort(distMi, 'Distance unknown');
                const price = getNumericTotalPrice(req);
                const priceLabel = price != null && Number.isFinite(price) ? formatUsd(price) : '—';
                const metaLine = `${priceLabel} · ${formatDurationDisplay(req as never)} · ${distLabel}`;

                return (
                  <Pressable
                    key={ts ?? idx}
                    onPress={() => {
                      if (ts == null) return;
                      router.push({
                        pathname: '/request-details',
                        params: { requestId: String(ts) },
                      });
                    }}
                    disabled={ts == null}
                    style={({ pressed }) => [
                      styles.card,
                      pressed && styles.cardPressed,
                      ts == null && styles.cardDisabled,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`${title}, ${metaLine}`}
                  >
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {title}
                    </Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {metaLine}
                    </Text>
                    {desc ? (
                      <Text
                        style={styles.cardDesc}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {desc}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })
            )
          ) : toolRows.length === 0 ? (
            <Text style={styles.emptyText}>{toolEmpty}</Text>
          ) : (
            toolRows.map((item) => (
              <Pressable
                key={item.id}
                onPress={() =>
                  router.push({
                    pathname: '/listing-detail',
                    params: { listingId: item.id },
                  })
                }
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, ${formatListingPriceWithUnit(item.price, item.priceUnit)}, ${formatMilesShort(item.distance)}`}
              >
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {`${formatListingPriceWithUnit(item.price, item.priceUnit)} · ${formatMilesShort(item.distance)}`}
                </Text>
                {item.description?.trim() ? (
                  <Text
                    style={styles.cardDesc}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {item.description.trim()}
                  </Text>
                ) : null}
              </Pressable>
            ))
          )}
        </ScrollView>

        <MainTabFab />
      </View>
    </KeyboardDismissScreen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  screenInner: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    paddingHorizontal: 20,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    marginBottom: 20,
    letterSpacing: -0.3,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: '#ECECEC',
    borderRadius: 12,
    padding: 3,
    marginBottom: 16,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  segmentItemActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentPressed: {
    opacity: 0.92,
  },
  segmentLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#636366',
  },
  segmentLabelActive: {
    color: '#000',
  },
  searchInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#000',
    backgroundColor: '#F9F9F9',
    marginBottom: 22,
  },
  emptyText: {
    color: ui.textSubtle,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 28,
    lineHeight: 22,
    paddingHorizontal: 12,
  },
  card: {
    ...cardChrome,
    marginBottom: 12,
  },
  cardPressed: {
    opacity: ui.pressOpacity,
  },
  cardDisabled: {
    opacity: 0.55,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
    marginBottom: 4,
    lineHeight: 21,
  },
  cardMeta: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3C3C43',
    marginBottom: 2,
    lineHeight: 18,
  },
  cardDesc: {
    fontSize: 13,
    color: '#8E8E93',
    lineHeight: 17,
    marginTop: 2,
    marginBottom: 0,
  },
});
