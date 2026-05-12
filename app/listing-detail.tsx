import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
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
import { ProtectionSummaryCard } from '@/components/ProtectionSummaryCard';
import { BackHeader } from '@/components/AppHeaders';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ui } from '@/constants/appUi';
import { useAuthUserId } from '@/lib/authUser';
import { hydrateListingsFromSupabase } from '@/lib/hydrateListingsFromSupabase';
import { isToolListingOwner } from '@/lib/listingOwnership';
import { formatUsd } from '@/lib/money';
import { normalizeListingImages } from '@/lib/normalizeListingImages';
import { formatMilesShort } from '@/lib/requestDistance';
import type { ToolListing } from '@/store/listingsStore';
import {
  formatListingPriceWithUnit,
  useListingsStore,
} from '@/store/listingsStore';
import { showFeedbackToast } from '@/store/feedbackToastStore';
import { getListingAvailabilityRanges } from '@/lib/listingAvailability';
import {
  hydrateListingAvailability,
  useListingAvailabilityStore,
} from '@/store/listingAvailabilityStore';

declare const __DEV__: boolean;

/** Browse/supabase rows attach `images` at runtime; store type stays unchanged. */
type ListingDetailRow = ToolListing & { images?: string[] };

type DurationKey = 'full' | 'multi';

const HERO_HEIGHT = 280;

const DURATION_OPTIONS: { key: DurationKey; label: string }[] = [
  { key: 'full', label: 'Full Day' },
  { key: 'multi', label: 'Multi Day' },
];

function priceForDuration(basePrice: number, key: DurationKey, dayCount: number): number {
  if (key === 'multi') return basePrice * Math.max(2, dayCount);
  return basePrice;
}

function unitForDurationSelection(key: DurationKey, listingPriceUnit?: string): string {
  if (key === 'multi') return 'total';
  return listingPriceUnit?.trim() || 'day';
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
  const [multiDayCountInput, setMultiDayCountInput] = useState('2');
  const insets = useSafeAreaInsets();
  const currentUserId = useAuthUserId();
  const params = useLocalSearchParams<{ listingId?: string | string[] }>();
  const listingId = firstParam(params.listingId);

  const listings = useListingsStore((s) => s.listings);
  const listing = useMemo(
    () => (listingId ? listings.find((l) => l.id === listingId) : undefined),
    [listings, listingId]
  );

  const heroUrls = useMemo(() => {
    if (!listing) return [];
    const row = listing as ListingDetailRow;
    return normalizeListingImages(row.images)
      .map((u) => u.trim())
      .filter(Boolean);
  }, [listing]);

  const isOwnListing = useMemo(
    () => isToolListingOwner(listing, currentUserId),
    [listing, currentUserId]
  );

  useFocusEffect(
    useCallback(() => {
      void hydrateListingsFromSupabase();
      if (listingId) void hydrateListingAvailability(listingId);
    }, [listingId])
  );

  useEffect(() => {
    setGalleryIndex(0);
  }, [listingId]);

  const isOwnListingForPad = useMemo(
    () => isToolListingOwner(listing, currentUserId),
    [listing, currentUserId]
  );

  const availabilityRows = useListingAvailabilityStore((s) =>
    listingId ? s.byListingId[listingId] ?? [] : []
  );
  const availabilityBuckets = useMemo(
    () => getListingAvailabilityRanges(availabilityRows),
    [availabilityRows]
  );

  /** Sticky CTA: renter = 2 buttons + gap; owner = 4 stacked actions */
  const stickyCtaScrollPaddingBottom =
    ui.spaceMd +
    (isOwnListingForPad ? 4 * (ui.padButtonV * 2 + 44) + 3 * 10 : 2 * (ui.padButtonV * 2 + 44) + 10) +
    insets.bottom +
    ui.spaceSm;

  const pageWidth = heroWidth > 0 ? heroWidth : windowWidth;

  if (__DEV__ && listing) {
    const row = listing as ListingDetailRow;
    console.log('RAW images:', row.images);
    console.log('NORMALIZED images:', heroUrls);
  }

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
  const meta = row.meta;
  const description = listing.description?.trim() ?? '';

  return (
    <ScreenWrapper style={styles.screenWrap}>
      <View style={styles.screen}>
        <ScreenEntrance style={styles.entranceFlex}>
          <View style={styles.contentWithStickyCta}>
            <View style={styles.scroll}>
              <BackHeader title="Listing Details" onBack={() => router.back()} style={styles.inlineDetailHeader} />
              <View
                style={styles.heroWrap}
                onLayout={(e) => setHeroWidth(e.nativeEvent.layout.width)}
              >
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
                  {meta?.conditionLabel ? (
                    <View style={styles.conditionPill}>
                      <Text style={styles.conditionPillText}>{meta.conditionLabel}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.price}>
                    {formatListingPriceWithUnit(
                      priceForDuration(
                        listing.price,
                        selectedDuration,
                        Math.max(2, parseInt(multiDayCountInput || '0', 10) || 2)
                      ),
                      unitForDurationSelection(selectedDuration, listing.priceUnit)
                    )}
                  </Text>
                  <Text style={styles.distance}>
                    {formatMilesShort(listing.distance)}
                  </Text>
                  {isOwnListing ? (
                    <Text style={styles.yourListing}>Your listing</Text>
                  ) : null}
                  <View style={styles.hostCard}>
                    <Text style={styles.sectionHeading}>Host</Text>
                    <Text style={styles.hostName}>{listing.ownerName}</Text>
                    <Text style={styles.hostMeta}>{listing.rating.toFixed(1)} rating</Text>
                  </View>
                </View>
                <View style={styles.durationSection}>
                  <Text style={styles.durationHeading}>Select duration</Text>
                  {DURATION_OPTIONS.map(({ key, label }) => {
                    const selected = selectedDuration === key;
                    const rowPrice = priceForDuration(
                      listing.price,
                      key,
                      Math.max(2, parseInt(multiDayCountInput || '0', 10) || 2)
                    );
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
                  {selectedDuration === 'multi' ? (
                    <View style={styles.multiDayWrap}>
                      <Text style={styles.durationHeading}>Number of days</Text>
                      <Pressable
                        pressOpacityFeedback={false}
                        style={({ pressed }) => [styles.durationStepper, pressed && styles.durationOptionPressed]}
                        onPress={() =>
                          setMultiDayCountInput(String(Math.max(2, (parseInt(multiDayCountInput || '0', 10) || 2) - 1)))
                        }
                      >
                        <Text style={styles.durationStepperText}>−</Text>
                      </Pressable>
                      <Text style={styles.multiDayValue}>{Math.max(2, parseInt(multiDayCountInput || '0', 10) || 2)}</Text>
                      <Pressable
                        pressOpacityFeedback={false}
                        style={({ pressed }) => [styles.durationStepper, pressed && styles.durationOptionPressed]}
                        onPress={() => setMultiDayCountInput(String(Math.max(2, (parseInt(multiDayCountInput || '0', 10) || 2) + 1)))}
                      >
                        <Text style={styles.durationStepperText}>＋</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>

                {description ? (
                  <View style={styles.descSection}>
                    <Text style={styles.description}>{listing.description}</Text>
                  </View>
                ) : null}

                {meta?.includedItems?.length ? (
                  <View style={styles.storeSection}>
                    <Text style={styles.sectionHeading}>What&apos;s included</Text>
                    <View style={styles.chipRow}>
                      {meta.includedItems.map((item) => (
                        <View key={item} style={styles.detailChip}>
                          <Text style={styles.detailChipText}>{item}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}

                {meta?.handoffSummary || meta?.serviceArea ? (
                  <View style={styles.storeSection}>
                    <Text style={styles.sectionHeading}>Pickup / delivery</Text>
                    <View style={styles.logisticsCard}>
                      {meta.handoffSummary ? (
                        <Text style={styles.logisticsPrimary}>{meta.handoffSummary}</Text>
                      ) : null}
                      {meta.serviceArea ? (
                        <Text style={styles.logisticsSecondary}>Service area: {meta.serviceArea}</Text>
                      ) : null}
                    </View>
                    <View style={styles.mapPlaceholder}>
                      <Text style={styles.mapPlaceholderText}>Map preview</Text>
                    </View>
                  </View>
                ) : null}

                <View style={styles.storeSection}>
                  <Text style={styles.sectionHeading}>Availability</Text>
                  <Text style={styles.availSummary}>
                    {availabilityBuckets.booked.length > 0
                      ? `${availabilityBuckets.booked.length} booked segment(s). `
                      : ''}
                    {availabilityBuckets.pending.length > 0
                      ? `${availabilityBuckets.pending.length} pending hold(s). `
                      : ''}
                    {availabilityBuckets.blocked.length > 0
                      ? `${availabilityBuckets.blocked.length} blackout segment(s).`
                      : availabilityBuckets.all.length === 0
                        ? 'All dates are available unless you add blackouts.'
                        : ''}
                  </Text>
                  {isOwnListing ? (
                    <Text style={styles.placeholderLineMuted}>
                      Use Manage availability in the toolbar below to block dates and review holds.
                    </Text>
                  ) : null}
                </View>

                {meta?.marketValue != null || meta?.verificationStatus || meta?.photoCount != null ? (
                  <View style={styles.storeSection}>
                    <Text style={styles.sectionHeading}>Trust & verification</Text>
                    {meta.marketValue != null ? (
                      <Text style={styles.trustLine}>Estimated value {formatUsd(meta.marketValue)}</Text>
                    ) : null}
                    {meta.photoCount != null ? (
                      <Text style={styles.trustLine}>{meta.photoCount} photos on file</Text>
                    ) : null}
                    {meta.verificationStatus ? (
                      <Text style={styles.trustLine}>{meta.verificationStatus}</Text>
                    ) : null}
                    <Text style={styles.placeholderLineMuted}>
                      ID and rental history checks will surface here as your storefront grows.
                    </Text>
                  </View>
                ) : null}

                <View style={styles.storeSection}>
                  <Text style={styles.sectionHeading}>More from this host</Text>
                  <Text style={styles.placeholderLine}>Related listings will appear here.</Text>
                </View>

                <View style={styles.protectionBlock}>
                  <ProtectionSummaryCard
                    replacementValue={Number(listing.replacementValue ?? 0)}
                    dailyLateFee={Number(listing.dailyLateFee ?? 0)}
                    maxLateFeeCap={Math.max(Number(listing.maxLateFeeCap ?? 0), Number(listing.dailyLateFee ?? 0))}
                    compact
                  />
                </View>
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
              {isOwnListing ? (
                <View style={styles.ctaStack}>
                  <Pressable
                    pressOpacityFeedback={false}
                    haptic
                    onPress={() => showFeedbackToast('Full listing edit is coming soon.')}
                    style={({ pressed }) => [styles.ownerCtaPrimary, pressed && styles.ownerCtaPrimaryPressed]}
                  >
                    <Text style={styles.ownerCtaPrimaryText}>Edit listing</Text>
                  </Pressable>
                  <Pressable
                    pressOpacityFeedback={false}
                    haptic
                    onPress={() =>
                      router.push({ pathname: '/listing-availability', params: { listingId: listing.id } })
                    }
                    style={({ pressed }) => [styles.ownerCtaSecondary, pressed && { opacity: 0.9 }]}
                  >
                    <Text style={styles.ownerCtaSecondaryText}>Manage availability</Text>
                  </Pressable>
                  <Pressable
                    pressOpacityFeedback={false}
                    haptic
                    onPress={() => showFeedbackToast('Pause listing will be available soon.')}
                    style={({ pressed }) => [styles.ownerCtaSecondary, pressed && { opacity: 0.9 }]}
                  >
                    <Text style={styles.ownerCtaSecondaryText}>Pause listing</Text>
                  </Pressable>
                  <Pressable
                    pressOpacityFeedback={false}
                    haptic
                    onPress={() => showFeedbackToast('Delete listing will be available soon.')}
                    style={({ pressed }) => [styles.ownerCtaDanger, pressed && { opacity: 0.9 }]}
                  >
                    <Text style={styles.ownerCtaDangerText}>Delete listing</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.ctaStack}>
                  <Pressable
                    pressOpacityFeedback={false}
                    haptic
                    onPress={() => {
                      const renterId = currentUserId.trim();
                      if (!renterId) {
                        showFeedbackToast('Sign in to make an offer.');
                        return;
                      }
                      const dayCount =
                        selectedDuration === 'multi'
                          ? Math.max(2, parseInt(multiDayCountInput || '0', 10) || 2)
                          : 1;
                      router.push({
                        pathname: '/make-offer-listing',
                        params: { listingId: listing.id },
                      });
                    }}
                    style={({ pressed }) => [styles.secondaryOfferBtn, pressed && { opacity: 0.92 }]}
                  >
                    <Text style={styles.secondaryOfferBtnText}>Make an Offer</Text>
                  </Pressable>
                  <Pressable
                    pressOpacityFeedback={false}
                    haptic
                    onPress={() => {
                      const renterId = currentUserId.trim();
                      if (!renterId) {
                        showFeedbackToast('Sign in to request this rental.');
                        return;
                      }
                      const dayCount =
                        selectedDuration === 'multi'
                          ? Math.max(2, parseInt(multiDayCountInput || '0', 10) || 2)
                          : 1;
                      const price = priceForDuration(
                        listing.price,
                        selectedDuration,
                        Math.max(2, parseInt(multiDayCountInput || '0', 10) || 2)
                      );
                      router.push({
                        pathname: '/listing-rental-intent',
                        params: {
                          listingId: listing.id,
                          durationKey: selectedDuration === 'multi' ? 'multi' : 'full',
                          dayCount: String(dayCount),
                          price: String(price),
                        },
                      });
                    }}
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      pressed && styles.primaryBtnPressed,
                    ]}
                  >
                    <Text style={styles.primaryBtnText}>Request Rental</Text>
                  </Pressable>
                </View>
              )}
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
    paddingHorizontal: 0,
    backgroundColor: ui.surfaceGrouped,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ui.border,
  },
  ctaStack: {
    gap: 10,
  },
  secondaryOfferBtn: {
    paddingVertical: ui.padButtonV,
    borderRadius: ui.radiusButton,
    borderWidth: 2,
    borderColor: ui.primary,
    backgroundColor: ui.background,
    alignItems: 'center',
  },
  secondaryOfferBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: ui.primary,
  },
  ownerCtaPrimary: {
    paddingVertical: ui.padButtonV,
    borderRadius: ui.radiusButton,
    backgroundColor: ui.primary,
    alignItems: 'center',
  },
  ownerCtaPrimaryPressed: {
    backgroundColor: ui.primaryPressed,
  },
  ownerCtaPrimaryText: {
    fontSize: 17,
    fontWeight: '700',
    color: ui.primaryOn,
  },
  ownerCtaSecondary: {
    paddingVertical: ui.padButtonV,
    borderRadius: ui.radiusButton,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    backgroundColor: ui.background,
    alignItems: 'center',
  },
  ownerCtaSecondaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: ui.primary,
  },
  ownerCtaDanger: {
    paddingVertical: ui.padButtonV,
    borderRadius: ui.radiusButton,
    alignItems: 'center',
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
  },
  ownerCtaDangerText: {
    fontSize: 16,
    fontWeight: '700',
    color: ui.danger,
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
  inlineDetailHeader: {
    marginBottom: ui.spaceSm,
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
  conditionPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(22, 163, 74, 0.12)',
    marginBottom: ui.spaceSm,
  },
  conditionPillText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#16A34A',
  },
  hostCard: {
    marginTop: ui.spaceMd,
    padding: ui.spaceMd,
    borderRadius: ui.radiusInput,
    backgroundColor: ui.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: ui.spaceSm,
  },
  hostName: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.textPrimary,
  },
  hostMeta: {
    marginTop: 4,
    fontSize: 14,
    color: ui.textSecondary,
  },
  storeSection: {
    marginBottom: ui.spaceLg,
    paddingHorizontal: 0,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: ui.surfaceNeutral,
  },
  detailChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: ui.textPrimary,
  },
  logisticsCard: {
    padding: ui.spaceMd,
    borderRadius: ui.radiusInput,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    backgroundColor: ui.background,
    marginBottom: ui.spaceSm,
  },
  logisticsPrimary: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.textPrimary,
  },
  logisticsSecondary: {
    marginTop: 6,
    fontSize: 14,
    color: ui.textSecondary,
  },
  mapPlaceholder: {
    height: 140,
    borderRadius: ui.radiusInput,
    backgroundColor: ui.surfaceNeutral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPlaceholderText: {
    fontSize: 14,
    color: ui.textSecondary,
    fontWeight: '600',
  },
  placeholderLine: {
    fontSize: 15,
    color: ui.textSecondary,
    lineHeight: 22,
  },
  availSummary: {
    fontSize: 15,
    color: ui.textPrimary,
    lineHeight: 22,
    marginBottom: ui.spaceSm,
  },
  placeholderLineMuted: {
    fontSize: 14,
    color: ui.textSecondary,
    lineHeight: 20,
    marginTop: ui.spaceSm,
  },
  trustLine: {
    fontSize: 15,
    color: ui.textPrimary,
    marginBottom: 6,
  },
  descSection: {
    paddingHorizontal: 0,
    marginBottom: ui.spaceLg,
  },
  protectionBlock: {
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
  multiDayWrap: {
    marginTop: ui.spaceSm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ui.spaceSm,
  },
  durationStepper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.background,
  },
  durationStepperText: {
    fontSize: 18,
    fontWeight: '700',
    color: ui.textPrimary,
    lineHeight: 20,
  },
  multiDayValue: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: ui.textPrimary,
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
