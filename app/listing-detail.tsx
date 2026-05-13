import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
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

import { BackHeader } from '@/components/AppHeaders';
import { ListingAvailabilityCalendar } from '@/components/calendar/ListingAvailabilityCalendar';
import { Pressable } from '@/components/Pressable';
import { ProtectionSummaryCard } from '@/components/ProtectionSummaryCard';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ui } from '@/constants/appUi';
import { useAuthUserId } from '@/lib/authUser';
import { hydrateListingsFromSupabase } from '@/lib/hydrateListingsFromSupabase';
import { getListingAvailabilityRanges } from '@/lib/listingAvailability';
import { isToolListingOwner } from '@/lib/listingOwnership';
import { listingDetailPriceForDuration } from '@/lib/listingRentalEstimate';
import { formatUsd } from '@/lib/money';
import { normalizeListingImages } from '@/lib/normalizeListingImages';
import { parseStructuredListingDescription } from '@/lib/listingStructuredDescription';
import { formatListingDistanceAway } from '@/lib/requestDistance';
import { showFeedbackToast } from '@/store/feedbackToastStore';
import {
  hydrateListingAvailability,
  useListingAvailabilityStore,
} from '@/store/listingAvailabilityStore';
import type { ToolListing } from '@/store/listingsStore';
import {
  formatListingPriceWithUnit,
  useListingsStore,
} from '@/store/listingsStore';

declare const __DEV__: boolean;

/** Browse/supabase rows attach `images` at runtime; store type stays unchanged. */
type ListingDetailRow = ToolListing & { images?: string[] };

type DurationKey = 'full' | 'multi';

/** Hero height clamp (px): readable image without crowding listing body. */
function clampHeroHeight(windowHeight: number): number {
  return Math.min(270, Math.max(240, Math.round(windowHeight * 0.32)));
}

const DURATION_OPTIONS: { key: DurationKey }[] = [{ key: 'full' }, { key: 'multi' }];

function unitForDurationSelection(key: DurationKey, listingPriceUnit?: string): string {
  if (key === 'multi') return 'total';
  return listingPriceUnit?.trim() || 'day';
}

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function hostDisplayFirstName(ownerName: string): string {
  const t = ownerName.trim();
  if (!t) return 'Host';
  return t.split(/\s+/)[0] ?? 'Host';
}

function hostInitials(ownerName: string): string {
  const parts = ownerName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase() || '?';
}

export default function ListingDetailScreen() {
  const router = useRouter();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const heroDisplayHeight = useMemo(() => clampHeroHeight(windowHeight), [windowHeight]);
  const [heroWidth, setHeroWidth] = useState(windowWidth);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [selectedDuration, setSelectedDuration] = useState<DurationKey>('full');
  const [multiDayCountInput, setMultiDayCountInput] = useState('2');
  const [availabilityPreviewOpen, setAvailabilityPreviewOpen] = useState(false);
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

  /** Merges `meta` (local wizard) with labeled lines in `description` (e.g. Supabase) — single source per fact. */
  const listingFacts = useMemo(() => {
    if (!listing) {
      return { rows: [] as { label: string; value: string }[], narrative: '' };
    }
    const parsed = parseStructuredListingDescription(listing.description?.trim() ?? '');
    const m = listing.meta;
    const displayCategory = parsed.category?.trim() ?? '';
    const displayCondition = (m?.conditionLabel?.trim() || parsed.condition?.trim()) ?? '';
    const displayConditionNotes = parsed.conditionNotes?.trim() ?? '';
    const displayIncluded = m?.includedItems?.length
      ? m.includedItems.join(', ')
      : (parsed.included?.trim() ?? '');
    const displayPickup = (m?.handoffSummary?.trim() || parsed.pickupDelivery?.trim()) ?? '';
    const displayDelivery = (m?.deliveryFeePreference?.trim() || parsed.deliveryFee?.trim()) ?? '';
    const displayService = (m?.serviceArea?.trim() || parsed.serviceArea?.trim()) ?? '';

    const rows: { label: string; value: string }[] = [];
    if (displayCategory) rows.push({ label: 'Category', value: displayCategory });
    if (displayCondition) rows.push({ label: 'Condition', value: displayCondition });
    if (displayConditionNotes) rows.push({ label: 'Condition notes', value: displayConditionNotes });
    if (displayIncluded) rows.push({ label: 'Included', value: displayIncluded });
    if (displayPickup) rows.push({ label: 'Pickup / delivery', value: displayPickup });
    if (displayDelivery) rows.push({ label: 'Delivery fee preference', value: displayDelivery });
    if (displayService) rows.push({ label: 'Service area', value: displayService });

    return { rows, narrative: parsed.narrative.trim() };
  }, [listing]);

  const trustDetailRows = useMemo(() => {
    if (!listing) return [] as { label: string; value: string }[];
    const m = listing.meta;
    if (!m) return [];
    const rows: { label: string; value: string }[] = [];
    if (m.marketValue != null) rows.push({ label: 'Estimated value', value: formatUsd(m.marketValue) });
    if (m.photoCount != null) rows.push({ label: 'Photos on file', value: String(m.photoCount) });
    if (m.verificationStatus) rows.push({ label: 'Verification', value: m.verificationStatus });
    return rows;
  }, [listing]);

  /** Sticky CTA: renter = 2 buttons + gap; owner = 4 stacked actions — keep compact so CTAs stay reachable. */
  const stickyCtaScrollPaddingBottom =
    8 +
    (isOwnListingForPad ? 4 * (ui.padButtonV * 2 + 44) + 3 * 10 : 2 * (ui.padButtonV * 2 + 44) + 6) +
    insets.bottom +
    6;

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

  const showFactsCard = listingFacts.rows.length > 0;
  const metadataCardIsFirstGrouped = showFactsCard;
  const availabilityCardIsFirstGrouped = !showFactsCard && !listingFacts.narrative;
  const showTrustCard = trustDetailRows.length > 0;

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
                  <View style={[styles.heroPlaceholder, { height: heroDisplayHeight }]} />
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
                      style={{ width: pageWidth, height: heroDisplayHeight }}
                      keyExtractor={(item, index) => `${listingId}-${index}`}
                      renderItem={({ item: uri, index }) => (
                        <Image
                          source={{ uri }}
                          style={[styles.heroImage, { width: pageWidth, height: heroDisplayHeight }]}
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
                <View style={styles.heroHostChipWrap} pointerEvents="box-none">
                  <View
                    style={styles.hostHeroChip}
                    accessibilityRole="text"
                    accessibilityLabel={`Host ${listing.ownerName}, ${listing.rating.toFixed(1)} stars`}
                  >
                    <View style={styles.hostAvatar}>
                      <Text style={styles.hostAvatarText}>{hostInitials(listing.ownerName)}</Text>
                    </View>
                    <View style={styles.hostChipTextCol}>
                      <Text style={styles.hostChipName} numberOfLines={1}>
                        {hostDisplayFirstName(listing.ownerName)}
                      </Text>
                      <View style={styles.hostChipRatingRow}>
                        <Ionicons name="star" size={11} color="#FBBF24" />
                        <Text style={styles.hostChipRating}>{listing.rating.toFixed(1)}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>

              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                  paddingBottom: stickyCtaScrollPaddingBottom,
                }}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                <View style={styles.contentBlock}>
                  <Text style={styles.title}>{listing.name}</Text>
                  <View style={styles.priceDistanceRow}>
                    <Text style={styles.price} numberOfLines={1}>
                      {formatListingPriceWithUnit(
                        listingDetailPriceForDuration(
                          listing.price,
                          selectedDuration,
                          Math.max(2, parseInt(multiDayCountInput || '0', 10) || 2)
                        ),
                        unitForDurationSelection(selectedDuration, listing.priceUnit)
                      )}
                    </Text>
                    <Text style={styles.distanceInline} numberOfLines={1}>
                      {formatListingDistanceAway(listing.distance)}
                    </Text>
                  </View>
                  {isOwnListing ? (
                    <Text style={styles.yourListing}>Your listing</Text>
                  ) : null}
                </View>
                <View style={styles.durationSection}>
                  <View style={styles.durationPillRow}>
                    {DURATION_OPTIONS.map(({ key }) => {
                      const selected = selectedDuration === key;
                      const rowPrice = listingDetailPriceForDuration(
                        listing.price,
                        key,
                        Math.max(2, parseInt(multiDayCountInput || '0', 10) || 2)
                      );
                      const pillLabel = key === 'full' ? 'One Day' : 'Multi Day';
                      return (
                        <Pressable
                          key={key}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          onPress={() => setSelectedDuration(key)}
                          style={({ pressed }) => [
                            styles.durationPill,
                            selected && styles.durationPillSelected,
                            pressed && styles.durationOptionPressed,
                          ]}
                        >
                          <Text
                            style={[styles.durationPillTitle, selected && styles.durationPillTitleSelected]}
                            numberOfLines={1}
                          >
                            {pillLabel}
                          </Text>
                          <Text
                            style={[styles.durationPillPrice, selected && styles.durationPillPriceSelected]}
                            numberOfLines={1}
                          >
                            {formatUsd(rowPrice)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {selectedDuration === 'multi' ? (
                    <View style={styles.multiDayWrap}>
                      <Text style={styles.multiDayLabel}>Number of days</Text>
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

                {showFactsCard ? (
                  <View style={[styles.groupedCard, metadataCardIsFirstGrouped && styles.groupedCardFirst]}>
                    <View style={styles.groupedCardInnerMeta}>
                      {listingFacts.rows.map((fact, index) => (
                        <View
                          key={`${fact.label}-${index}`}
                          style={[
                            styles.metaFactBlock,
                            index < listingFacts.rows.length - 1 && styles.metaFactBlockDivider,
                          ]}
                        >
                          <Text style={styles.metaFactLabel}>{fact.label}</Text>
                          <Text style={styles.metaFactValue}>{fact.value}</Text>
                        </View>
                      ))}
                      <View style={[styles.mapPlaceholder, styles.mapInMetadataCard]}>
                        <Text style={styles.mapPlaceholderText}>Map preview</Text>
                      </View>
                    </View>
                  </View>
                ) : null}

                {listingFacts.narrative ? (
                  <View style={styles.aboutSection}>
                    <Text style={styles.aboutSectionTitle}>About this listing</Text>
                    <Text style={styles.aboutBody}>{listingFacts.narrative}</Text>
                  </View>
                ) : null}

                <View
                  style={[
                    styles.groupedCard,
                    availabilityCardIsFirstGrouped && styles.groupedCardFirst,
                  ]}
                >
                  <View style={styles.groupedCardHeaderPad}>
                    <Text style={styles.metaFactLabel}>Availability</Text>
                    <Text style={styles.groupedCardSummary}>
                      {availabilityBuckets.booked.length > 0
                        ? `${availabilityBuckets.booked.length} booked segment(s). `
                        : ''}
                      {availabilityBuckets.pending.length > 0
                        ? `${availabilityBuckets.pending.length} pending hold(s). `
                        : ''}
                      {availabilityBuckets.blocked.length > 0
                        ? `${availabilityBuckets.blocked.length} blackout segment(s).`
                        : availabilityBuckets.all.length === 0
                          ? 'All dates are available unless the host adds blackouts.'
                          : ''}
                    </Text>
                    {isOwnListing ? (
                      <Text style={styles.groupedCardOwnerHint}>
                        Use Manage availability in the toolbar below to block dates and review holds.
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.cardFullBleedDivider} />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: availabilityPreviewOpen }}
                    accessibilityLabel={
                      availabilityPreviewOpen ? 'Hide availability calendar' : 'Show availability calendar'
                    }
                    style={({ pressed }) => [
                      styles.availToggleRowGrouped,
                      pressed && styles.availPreviewTogglePressed,
                    ]}
                    onPress={() => setAvailabilityPreviewOpen((v) => !v)}
                  >
                    <Text style={styles.availPreviewToggleLabel}>
                      {availabilityPreviewOpen ? 'Hide calendar' : 'Show calendar'}
                    </Text>
                    <Ionicons
                      name={availabilityPreviewOpen ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={ui.textSecondary}
                    />
                  </Pressable>
                  {availabilityPreviewOpen ? (
                    <>
                      <View style={styles.cardFullBleedDivider} />
                      <View style={styles.availCalendarShell}>
                        <ListingAvailabilityCalendar listingId={listingId} readOnly />
                      </View>
                    </>
                  ) : null}
                </View>

                {showTrustCard ? (
                  <View style={styles.groupedCard}>
                    <View style={styles.groupedCardHeaderPad}>
                      <Text style={styles.metaFactLabel}>Trust & verification</Text>
                    </View>
                    <View style={styles.cardFullBleedDivider} />
                    {trustDetailRows.map((r, i) => (
                      <React.Fragment key={r.label}>
                        {i > 0 ? <View style={styles.cardFullBleedDivider} /> : null}
                        <View style={styles.groupedCardRowPad}>
                          <Text style={styles.metaFactLabel}>{r.label}</Text>
                          <Text style={styles.metaFactValue}>{r.value}</Text>
                        </View>
                      </React.Fragment>
                    ))}
                    <View style={styles.cardFullBleedDivider} />
                    <View style={styles.groupedCardFooterPad}>
                      <Text style={styles.trustFooterNote}>
                        ID and rental history checks will surface here as your storefront grows.
                      </Text>
                    </View>
                  </View>
                ) : null}

                <View style={styles.groupedCard}>
                  <View style={styles.groupedCardHeaderPad}>
                    <Text style={styles.metaFactLabel}>More from this host</Text>
                  </View>
                  <View style={styles.cardFullBleedDivider} />
                  <View style={styles.moreFromEmptyWell}>
                    <Ionicons name="grid-outline" size={26} color={ui.textSecondary} style={styles.moreFromEmptyIcon} />
                    <Text style={styles.moreFromEmptyTitle}>Nothing else to show yet</Text>
                    <Text style={styles.moreFromEmptySub}>
                      Other listings from this host will appear here when they're available.
                    </Text>
                  </View>
                </View>

                <View style={styles.termsSectionWrap}>
                  <ProtectionSummaryCard
                    replacementValue={Number(listing.replacementValue ?? 0)}
                    dailyLateFee={Number(listing.dailyLateFee ?? 0)}
                    maxLateFeeCap={Math.max(Number(listing.maxLateFeeCap ?? 0), Number(listing.dailyLateFee ?? 0))}
                    compact
                    variant="terms"
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
                      const price = listingDetailPriceForDuration(
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
    paddingTop: 8,
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
    marginBottom: 6,
  },
  /** Bleed hero to horizontal edges (ScreenWrapper uses 16px horizontal padding). */
  heroWrap: {
    marginHorizontal: -16,
    marginBottom: ui.spaceSm,
    position: 'relative',
  },
  heroImage: {
    backgroundColor: ui.surfaceNeutral,
  },
  heroDots: {
    position: 'absolute',
    bottom: 8,
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
    backgroundColor: ui.surfaceNeutral,
  },
  heroHostChipWrap: {
    position: 'absolute',
    right: 10,
    bottom: 36,
    zIndex: 4,
    maxWidth: '52%',
  },
  hostHeroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(22, 27, 34, 0.58)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  hostAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hostAvatarText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  hostChipTextCol: {
    flexShrink: 1,
    minWidth: 0,
  },
  hostChipName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  hostChipRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 1,
  },
  hostChipRating: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.92)',
  },
  contentBlock: {
    paddingHorizontal: 0,
    marginBottom: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: ui.spaceSm,
  },
  priceDistanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 2,
  },
  price: {
    fontSize: 18,
    fontWeight: '600',
    color: ui.textPrimary,
    flexShrink: 0,
    maxWidth: '58%',
  },
  distanceInline: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: ui.textSecondary,
    textAlign: 'right',
  },
  yourListing: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '600',
    color: ui.primary,
  },
  groupedCard: {
    marginBottom: 16,
    borderRadius: ui.radiusInput,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    backgroundColor: ui.background,
    overflow: 'hidden',
  },
  groupedCardFirst: {
    marginTop: 12,
  },
  groupedCardInnerMeta: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 14,
  },
  groupedCardHeaderPad: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  groupedCardSummary: {
    fontSize: 14,
    fontWeight: '400',
    color: ui.textSecondary,
    lineHeight: 20,
    marginTop: 2,
  },
  groupedCardOwnerHint: {
    fontSize: 13,
    fontWeight: '400',
    color: ui.textSecondary,
    lineHeight: 18,
    marginTop: 10,
  },
  groupedCardRowPad: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  groupedCardFooterPad: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },
  cardFullBleedDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: ui.border,
  },
  availToggleRowGrouped: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  availCalendarShell: {
    height: 200,
    maxHeight: 220,
    minHeight: 188,
    backgroundColor: ui.background,
    overflow: 'hidden',
  },
  trustFooterNote: {
    fontSize: 13,
    fontWeight: '400',
    color: ui.textSecondary,
    lineHeight: 18,
  },
  moreFromEmptyWell: {
    paddingHorizontal: 16,
    paddingVertical: 22,
    alignItems: 'center',
  },
  moreFromEmptyIcon: {
    opacity: 0.45,
    marginBottom: 10,
  },
  moreFromEmptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: ui.textPrimary,
    letterSpacing: -0.2,
    marginBottom: 6,
    textAlign: 'center',
  },
  moreFromEmptySub: {
    fontSize: 14,
    fontWeight: '400',
    color: ui.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 280,
  },
  termsSectionWrap: {
    marginBottom: 16,
  },
  metaFactBlock: {
    paddingVertical: 16,
  },
  metaFactBlockDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
  },
  metaFactLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.textSecondary,
    letterSpacing: 0.55,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  metaFactValue: {
    fontSize: 16,
    fontWeight: '400',
    color: ui.textPrimary,
    lineHeight: 24,
  },
  mapInMetadataCard: {
    marginTop: 6,
    marginBottom: 0,
  },
  aboutSection: {
    marginBottom: 16,
    marginTop: 2,
  },
  aboutSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 10,
    letterSpacing: -0.25,
  },
  aboutBody: {
    fontSize: 16,
    fontWeight: '400',
    color: ui.textPrimary,
    lineHeight: 24,
  },
  detailParagraph: {
    fontSize: 15,
    color: ui.textPrimary,
    lineHeight: 24,
    marginBottom: 8,
  },
  detailParagraphTight: {
    marginTop: 4,
  },
  detailBold: {
    fontWeight: '700',
    color: ui.textPrimary,
  },
  detailValueText: {
    fontWeight: '400',
    color: ui.textPrimary,
  },
  mapPlaceholder: {
    height: 100,
    marginTop: ui.spaceSm,
    borderRadius: ui.radiusInput,
    backgroundColor: ui.surfaceNeutral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPlaceholderText: {
    fontSize: 13,
    color: ui.textSecondary,
    fontWeight: '600',
  },
  placeholderLine: {
    fontSize: 15,
    color: ui.textSecondary,
    lineHeight: 22,
  },
  availPreviewTogglePressed: {
    opacity: 0.92,
  },
  availPreviewToggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.textPrimary,
  },
  placeholderLineMuted: {
    fontSize: 13,
    color: ui.textSecondary,
    lineHeight: 18,
    marginTop: 6,
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
    marginTop: 2,
    marginBottom: 10,
  },
  durationPillRow: {
    flexDirection: 'row',
    gap: 8,
  },
  durationPill: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: ui.radiusInput,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    backgroundColor: ui.background,
  },
  durationPillSelected: {
    borderWidth: 2,
    borderColor: ui.primary,
    backgroundColor: ui.surfaceTintPrimary,
  },
  durationOptionPressed: {
    opacity: 0.92,
  },
  durationPillTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: ui.textPrimary,
    textAlign: 'center',
  },
  durationPillTitleSelected: {
    color: ui.primary,
    fontWeight: '700',
  },
  durationPillPrice: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: ui.textSecondary,
    textAlign: 'center',
  },
  durationPillPriceSelected: {
    color: ui.primary,
    fontWeight: '700',
  },
  multiDayWrap: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ui.spaceSm,
  },
  multiDayLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: ui.textSecondary,
    minWidth: 100,
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
});
