import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Pressable } from '@/components/Pressable';
import { ScreenBackButton } from '@/components/ScreenBackButton';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ui } from '@/constants/appUi';
import { useAuthUserId } from '@/lib/authUser';
import { insertRentalRequest } from '@/lib/insertRentalRequest';
import { formatUsd } from '@/lib/money';
import { normalizeListingImages } from '@/lib/normalizeListingImages';
import { formatMilesShort } from '@/lib/requestDistance';
import type { ToolListing } from '@/store/listingsStore';
import {
  formatListingPriceWithUnit,
  useListingsStore,
} from '@/store/listingsStore';

/** Browse/supabase rows attach `images` at runtime; store type stays unchanged. */
type ListingDetailRow = ToolListing & { images?: string[] };

type DurationKey = 'half' | 'full' | 'weekly';

const HERO_HEIGHT = 280;

const DURATION_OPTIONS: { key: DurationKey; label: string }[] = [
  { key: 'half', label: 'Half Day' },
  { key: 'full', label: 'Full Day' },
  { key: 'weekly', label: 'Weekly' },
];

function priceForDuration(basePrice: number, key: DurationKey): number {
  switch (key) {
    case 'half':
      return basePrice * 0.6;
    case 'full':
      return basePrice;
    case 'weekly':
      return basePrice * 5;
  }
}

function unitForDurationSelection(key: DurationKey, listingPriceUnit?: string): string {
  switch (key) {
    case 'half':
      return 'half day';
    case 'full':
      return listingPriceUnit?.trim() || 'day';
    case 'weekly':
      return 'week';
  }
}

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export default function ListingDetailScreen() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const [heroWidth, setHeroWidth] = useState(windowWidth);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [selectedDuration, setSelectedDuration] = useState<DurationKey>('full');
  const insets = useSafeAreaInsets();
  const currentUserId = useAuthUserId();
  const params = useLocalSearchParams<{ listingId?: string | string[] }>();
  const listingId = firstParam(params.listingId);

  const listings = useListingsStore((s) => s.listings);
  const listing = useMemo(
    () => (listingId ? listings.find((l) => l.id === listingId) : undefined),
    [listings, listingId]
  );

  if (!listingId || !listing) {
    return (
      <ScreenWrapper style={styles.screenWrap}>
        <View style={[styles.screen, styles.centered]}>
          <ScreenEntrance style={styles.entranceFillCentered}>
            <Text style={styles.notFound}>Listing not found</Text>
          </ScreenEntrance>
        </View>
      </ScreenWrapper>
    );
  }

  const row = listing as ListingDetailRow;
  const description = listing.description?.trim() ?? '';
  const isOwnListing =
    Boolean(currentUserId) &&
    Boolean(listing.ownerUserId) &&
    listing.ownerUserId === currentUserId;

  const heroUrls = useMemo(
    () =>
      normalizeListingImages(row.images)
        .map((u) => u.trim())
        .filter(Boolean),
    [row.images]
  );

  console.log('RAW images:', row.images);
  console.log('NORMALIZED images:', heroUrls);
  const pageWidth = heroWidth > 0 ? heroWidth : windowWidth;

  useEffect(() => {
    setGalleryIndex(0);
  }, [listingId]);

  /** Space for sticky CTA: bar top pad + primary button (~line + vertical padding) + safe bottom + small gap */
  const stickyCtaScrollPaddingBottom =
    ui.spaceMd +
    ui.padButtonV * 2 +
    22 +
    insets.bottom +
    ui.spaceSm;

  return (
    <ScreenWrapper style={styles.screenWrap}>
      <View style={styles.screen}>
        <ScreenEntrance style={styles.entranceFlex}>
          <View style={styles.contentWithStickyCta}>
            <View style={styles.scroll}>
              <View
                style={styles.heroWrap}
                onLayout={(e) => setHeroWidth(e.nativeEvent.layout.width)}
              >
                <ScreenBackButton variant="overlay" onPress={() => router.back()} />
                {heroUrls.length === 0 ? (
                  <View style={styles.heroPlaceholder} />
                ) : (
                  <>
                    <FlatList
                      key={listingId}
                      data={heroUrls}
                      horizontal
                      pagingEnabled
                      showsHorizontalScrollIndicator={false}
                      nestedScrollEnabled
                      directionalLockEnabled
                      decelerationRate="fast"
                      keyboardShouldPersistTaps="handled"
                      style={{ width: pageWidth, height: HERO_HEIGHT }}
                      keyExtractor={(item, index) => `${listingId}-${index}`}
                      renderItem={({ item: uri, index }) => (
                        <Image
                          source={{ uri }}
                          style={[styles.heroImage, { width: pageWidth }]}
                          resizeMode="cover"
                          accessibilityRole="image"
                          accessibilityLabel={`Photo ${index + 1} of ${heroUrls.length}`}
                        />
                      )}
                      onMomentumScrollEnd={(ev) => {
                        const x = ev.nativeEvent.contentOffset.x;
                        const w = pageWidth;
                        if (!(w > 0)) return;
                        const next = Math.round(x / w);
                        if (next >= 0 && next < heroUrls.length) {
                          setGalleryIndex(next);
                        }
                      }}
                    />
                    {heroUrls.length > 1 ? (
                      <View style={styles.heroDots} pointerEvents="none">
                        {heroUrls.map((_, i) => (
                          <View
                            key={`dot-${i}`}
                            style={[
                              styles.heroDot,
                              i === galleryIndex && styles.heroDotActive,
                            ]}
                          />
                        ))}
                      </View>
                    ) : null}
                  </>
                )}
              </View>

              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                  paddingBottom: stickyCtaScrollPaddingBottom,
                }}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.contentBlock}>
                  <Text style={styles.title}>{listing.name}</Text>
                  <Text style={styles.price}>
                    {formatListingPriceWithUnit(
                      priceForDuration(listing.price, selectedDuration),
                      unitForDurationSelection(selectedDuration, listing.priceUnit)
                    )}
                  </Text>
                  <Text style={styles.distance}>
                    {formatMilesShort(listing.distance)}
                  </Text>
                  {isOwnListing ? (
                    <Text style={styles.yourListing}>Your listing</Text>
                  ) : null}
                </View>
                <View style={styles.durationSection}>
                  <Text style={styles.durationHeading}>Select duration</Text>
                  {DURATION_OPTIONS.map(({ key, label }) => {
                    const selected = selectedDuration === key;
                    const rowPrice = priceForDuration(listing.price, key);
                    return (
                      <Pressable
                        key={key}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => setSelectedDuration(key)}
                        style={({ pressed }) => [
                          styles.durationOption,
                          selected && styles.durationOptionSelected,
                          pressed && styles.durationOptionPressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.durationOptionLabel,
                            selected && styles.durationOptionLabelSelected,
                          ]}
                        >
                          {label}
                        </Text>
                        <Text
                          style={[
                            styles.durationOptionPrice,
                            selected && styles.durationOptionPriceSelected,
                          ]}
                        >
                          {formatUsd(rowPrice)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {description ? (
                  <View style={styles.descSection}>
                    <Text style={styles.description}>{listing.description}</Text>
                  </View>
                ) : null}
              </ScrollView>
            </View>

            <View
              style={[
                styles.ctaDock,
                {
                  paddingBottom: insets.bottom,
                },
              ]}
            >
              <Pressable
                pressOpacityFeedback={false}
                haptic
                onPress={async () => {
                  const renterId = currentUserId.trim();
                  if (!renterId) {
                    console.error('[rental_requests] missing renter_user_id');
                    return;
                  }

                  const price = priceForDuration(listing.price, selectedDuration);

                  try {
                    await insertRentalRequest({
                      listingId: listing.id,
                      renterUserId: renterId,
                      durationType: selectedDuration,
                      price,
                    });
                  } catch (err: unknown) {
                    const msg =
                      err instanceof Error
                        ? err.message
                        : typeof err === 'object' &&
                            err !== null &&
                            'message' in err &&
                            typeof (err as { message: unknown }).message === 'string'
                          ? (err as { message: string }).message
                          : String(err ?? 'Unknown error');
                    console.error('[rental_requests] Request Rental failed', err);
                    Alert.alert('Could not send rental request', msg);
                  }
                }}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  pressed && styles.primaryBtnPressed,
                ]}
              >
                <Text style={styles.primaryBtnText}>Request Rental</Text>
              </Pressable>
            </View>
          </View>
        </ScreenEntrance>
      </View>
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
  entranceFlex: {
    flex: 1,
  },
  contentWithStickyCta: {
    flex: 1,
  },
  ctaDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: ui.spaceMd,
    /** Horizontal inset comes from ScreenWrapper; keeps CTA aligned with scroll body */
    paddingHorizontal: 0,
    backgroundColor: ui.surfaceGrouped,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ui.border,
  },
  entranceFillCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  notFound: {
    fontSize: 16,
    color: ui.textSecondary,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: ui.spaceMd,
  },
  /** Bleed hero to horizontal edges (ScreenWrapper uses 16px horizontal padding). */
  heroWrap: {
    marginHorizontal: -16,
    marginBottom: ui.spaceMd,
    position: 'relative',
  },
  heroImage: {
    height: HERO_HEIGHT,
    backgroundColor: ui.surfaceNeutral,
  },
  heroDots: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginHorizontal: 3,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  heroDotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  heroPlaceholder: {
    width: '100%',
    height: HERO_HEIGHT,
    backgroundColor: ui.surfaceNeutral,
  },
  contentBlock: {
    paddingHorizontal: 0,
    marginBottom: ui.spaceMd,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: ui.spaceSm,
  },
  price: {
    fontSize: 18,
    fontWeight: '600',
    color: ui.textPrimary,
    marginBottom: 4,
  },
  distance: {
    fontSize: 15,
    color: ui.textSecondary,
  },
  yourListing: {
    marginTop: ui.spaceSm,
    fontSize: 14,
    fontWeight: '600',
    color: ui.primary,
  },
  descSection: {
    paddingHorizontal: 0,
    marginBottom: ui.spaceLg,
  },
  description: {
    fontSize: 16,
    color: ui.textPrimary,
    lineHeight: 24,
  },
  primaryBtn: {
    paddingVertical: ui.padButtonV,
    borderRadius: ui.radiusButton,
    backgroundColor: ui.primary,
    alignItems: 'center',
  },
  primaryBtnPressed: {
    backgroundColor: ui.primaryPressed,
  },
  primaryBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: ui.primaryOn,
  },
  durationSection: {
    marginBottom: ui.spaceMd,
  },
  durationHeading: {
    fontSize: 15,
    fontWeight: '600',
    color: ui.textPrimary,
    marginBottom: ui.spaceSm,
  },
  durationOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: ui.spaceMd,
    borderRadius: ui.radiusInput,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    backgroundColor: ui.background,
    marginBottom: ui.spaceSm,
  },
  durationOptionSelected: {
    borderWidth: 2,
    borderColor: ui.primary,
    backgroundColor: ui.surfaceTintPrimary,
  },
  durationOptionPressed: {
    opacity: 0.92,
  },
  durationOptionLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: ui.textPrimary,
  },
  durationOptionLabelSelected: {
    fontWeight: '700',
    color: ui.primary,
  },
  durationOptionPrice: {
    fontSize: 15,
    fontWeight: '600',
    color: ui.textSecondary,
  },
  durationOptionPriceSelected: {
    color: ui.primary,
  },
});
