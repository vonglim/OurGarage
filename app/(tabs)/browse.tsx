import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CardPressable } from '@/components/CardPressable';
import { Pressable } from '@/components/Pressable';
import { ScreenEntrance } from '@/components/ScreenEntrance';
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
import { ui } from '@/constants/appUi';

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
      <ScreenEntrance style={styles.screenInner}>
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
            placeholderTextColor={ui.textSecondary}
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
                const duration = formatDurationDisplay(req as never);
                const metaLine = `${priceLabel} · ${duration}. ${distLabel}`;

                return (
                  <CardPressable
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
                      idx === 0 && styles.cardEdge,
                      pressed && ts != null && styles.cardPressed,
                      ts == null && styles.cardDisabled,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`${title}, ${metaLine}`}
                  >
                    <Text
                      style={styles.cardTitle}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {title}
                    </Text>
                    <Text
                      style={styles.cardPriceDuration}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      <Text style={styles.cardPrice}>{priceLabel}</Text>
                      <Text style={styles.cardMuted}> · {duration}</Text>
                    </Text>
                    <Text
                      style={styles.cardDistance}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {distLabel}
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
                  </CardPressable>
                );
              })
            )
          ) : toolRows.length === 0 ? (
            <Text style={styles.emptyText}>{toolEmpty}</Text>
          ) : (
            toolRows.map((item, idx) => {
              const priceStr = formatListingPriceWithUnit(item.price, item.priceUnit);
              const distStr = formatMilesShort(item.distance);
              return (
                <CardPressable
                  key={item.id}
                  onPress={() =>
                    router.push({
                      pathname: '/listing-detail',
                      params: { listingId: item.id },
                    })
                  }
                  style={({ pressed }) => [
                    styles.card,
                    idx === 0 && styles.cardEdge,
                    pressed && styles.cardPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name}, ${priceStr}, ${distStr}`}
                >
                  <Text
                    style={styles.cardTitle}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {item.name}
                  </Text>
                  <Text
                    style={styles.cardPricePrimary}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {priceStr}
                  </Text>
                  <Text
                    style={styles.cardDistance}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {distStr}
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
                </CardPressable>
              );
            })
          )}
        </ScrollView>

        <MainTabFab />
      </ScreenEntrance>
    </KeyboardDismissScreen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: ui.background,
  },
  screenInner: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: ui.background,
  },
  content: {
    paddingHorizontal: ui.padScreenH,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: ui.textPrimary,
    marginBottom: ui.spaceMd,
    letterSpacing: -0.3,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: ui.surfaceNeutral,
    borderRadius: ui.radiusInput,
    padding: 3,
    marginBottom: ui.spaceSm + 2,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: ui.radiusInput - 4,
  },
  segmentItemActive: {
    backgroundColor: ui.background,
  },
  segmentPressed: {
    opacity: 0.92,
  },
  segmentLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: ui.textSecondary,
  },
  segmentLabelActive: {
    color: ui.textPrimary,
  },
  searchInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    borderRadius: ui.radiusInput,
    paddingHorizontal: ui.spaceMd - 2,
    paddingVertical: 9,
    fontSize: 16,
    color: ui.textPrimary,
    backgroundColor: ui.surfaceInput,
    marginBottom: ui.spaceSm + 2,
  },
  emptyText: {
    color: ui.textSubtle,
    fontSize: 15,
    textAlign: 'center',
    marginTop: ui.spaceSection,
    lineHeight: 22,
    paddingHorizontal: 12,
  },
  card: {
    backgroundColor: ui.background,
    paddingVertical: 5,
    paddingHorizontal: 13,
    borderBottomWidth: 1,
    borderBottomColor: ui.border,
  },
  /** Top edge of list for a light enclosure under the search field. */
  cardEdge: {
    borderTopWidth: 1,
    borderTopColor: ui.border,
  },
  cardPressed: {
    backgroundColor: ui.surfaceStriped,
  },
  cardDisabled: {
    opacity: 0.55,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: ui.textPrimary,
    marginBottom: 0,
    lineHeight: 19,
    letterSpacing: -0.25,
  },
  /** Request row: price (semi-bold) + duration (muted). */
  cardPriceDuration: {
    marginTop: 0,
    marginBottom: 0,
    lineHeight: 18,
  },
  cardPrice: {
    fontSize: ui.fontPrice,
    fontWeight: '600',
    color: ui.textPrimary,
    letterSpacing: -0.2,
  },
  cardMuted: {
    fontSize: 14,
    fontWeight: '400',
    color: ui.textSecondary,
  },
  /** Listing row: full price + unit line. */
  cardPricePrimary: {
    fontSize: ui.fontPrice,
    fontWeight: '600',
    color: ui.textPrimary,
    letterSpacing: -0.2,
    lineHeight: 18,
    marginTop: 0,
    marginBottom: 0,
  },
  /** Distance on its own line (requests + listings). */
  cardDistance: {
    fontSize: 13,
    fontWeight: '400',
    color: ui.textSecondary,
    lineHeight: 16,
    marginTop: 0,
    marginBottom: 0,
  },
  cardDesc: {
    fontSize: 12,
    fontWeight: '400',
    color: ui.textSecondary,
    lineHeight: 15,
    marginTop: 0,
    marginBottom: 0,
  },
});
