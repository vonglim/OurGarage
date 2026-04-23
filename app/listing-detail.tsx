import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '@/components/Pressable';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from '@/components/KeyboardDismissScreen';
import { formatListingDistanceAway } from '@/lib/requestDistance';
import { formatListingPriceWithUnit, getListingById } from '@/store/listingsStore';
import { cardChrome, primarySolidPressed, ui } from '@/constants/appUi';

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function formatListedAt(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export default function ListingDetailScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ listingId?: string | string[] }>();
  const id = firstParam(params.listingId);

  const listing = useMemo(() => (id ? getListingById(id) : undefined), [id]);

  if (!id || !listing) {
    return (
      <KeyboardDismissScreen style={[styles.screen, styles.centered]}>
        <ScreenEntrance style={styles.entranceFillCentered}>
          <Text style={styles.muted}>Listing not found.</Text>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.textBtn}>
            <Text style={styles.textBtnLabel}>Go back</Text>
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
        <Text style={styles.headerTitle}>Equipment listing</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 32 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.toolName}>{listing.name}</Text>
        <Text style={styles.priceLine}>
          {formatListingPriceWithUnit(listing.price, listing.priceUnit)}
        </Text>
        <Text style={styles.ownerLine}>
          Listed by {listing.ownerName} · ⭐ {listing.rating.toFixed(1)}
        </Text>
        <Text style={styles.distanceLine}>{formatListingDistanceAway(listing.distance)}</Text>
        <Text style={styles.dateLine}>Listed {formatListedAt(listing.createdAt)}</Text>

        {listing.description?.trim() ? (
          <>
            <View style={styles.sectionGap} />
            <Text style={styles.sectionLabel}>Description</Text>
            <View style={styles.card}>
              <Text style={styles.body}>{listing.description.trim()}</Text>
            </View>
          </>
        ) : null}

        <View style={styles.sectionGap} />

        <Pressable
          pressOpacityFeedback={false}
          haptic
          onPress={() =>
            router.push({
              pathname: '/request-a-tool',
              params: {
                prefillToolName: listing.name,
                prefillPrice: String(listing.price),
              },
            })
          }
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
        >
          <Text style={styles.primaryBtnText}>Request this item</Text>
        </Pressable>
      </ScrollView>
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
  muted: {
    fontSize: 15,
    color: ui.textSubtle,
    marginBottom: 16,
    textAlign: 'center',
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  toolName: {
    fontSize: 24,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 8,
  },
  ownerLine: {
    fontSize: 15,
    color: ui.textSecondary,
    lineHeight: 22,
    marginBottom: 4,
  },
  distanceLine: {
    fontSize: 15,
    color: ui.textSecondary,
    lineHeight: 22,
    marginBottom: 8,
  },
  priceLine: {
    fontSize: 22,
    fontWeight: '700',
    color: ui.primary,
    marginBottom: 10,
  },
  dateLine: {
    fontSize: 14,
    color: ui.textSecondary,
  },
  sectionGap: {
    height: 22,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: ui.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  card: {
    ...cardChrome,
  },
  body: {
    fontSize: 16,
    color: ui.textPrimary,
    lineHeight: 24,
  },
  primaryBtn: {
    marginTop: 8,
    paddingVertical: 16,
    borderRadius: ui.radiusButton,
    backgroundColor: ui.primary,
    alignItems: 'center',
  },
  primaryBtnPressed: {
    ...primarySolidPressed,
  },
  primaryBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: ui.primaryOn,
  },
});
