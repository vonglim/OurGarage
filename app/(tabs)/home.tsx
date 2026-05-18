import { CardPressable } from '@/components/CardPressable';
import { Pressable } from '@/components/Pressable';
import { cardChrome, primarySolidPressed, shadowCard, shadowKey, ui } from '@/constants/appUi';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import HomeMarketing from '@/components/HomeMarketing';
import { MainTabFab } from '@/components/MainTabFab';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { useAuthUserId } from '@/lib/authUser';
import { fetchUnifiedRentalsForUser } from '@/lib/fetchUnifiedRentalsForUser';
import {
  selectHomeActiveRentalCardModel,
  type HomeActiveRentalCardModel,
} from '@/lib/homeActiveRentalCardModel';
import { formatUsd, getNumericTotalPrice } from '@/lib/money';
import { listOpenRequestsSortedByDistance } from '@/lib/openRequestsForBrowse';
import { hydrateListingsFromSupabase } from '@/lib/hydrateListingsFromSupabase';
import { formatMilesShort, milesFromViewerToRequest } from '@/lib/requestDistance';
import { getRequestSupabaseRowId } from '@/lib/requestOwnership';
import { getOnboardingTermsAccepted } from '@/store/agreementsStore';
import type { ToolListing } from '@/store/listingsStore';
import { formatListingPriceWithUnit, useListingsStore } from '@/store/listingsStore';
import { touchLastActive } from '@/store/profileStore';
import { refreshRequestsFromSupabase, useRequestsStore } from '@/store/requestsStore';

const PREVIEW_COUNT = 5;
const PREVIEW_CARD_WIDTH = 260;

const SECTION_CARD_PADDING = ui.padCard;
const PRIMARY_ACTION_MIN_H = 76;
const SECONDARY_ACTION_MIN_H = 46;

const EQUIPMENT_SUGGESTIONS = [
  'Power Drill',
  'Ladder',
  'Pressure Washer',
  'Circular Saw',
  'Generator',
] as const;

function requestDistanceLabel(req: unknown): string {
  const mi = milesFromViewerToRequest(req as Parameters<typeof milesFromViewerToRequest>[0]);
  return formatMilesShort(mi, 'Nearby');
}

function requestPriceLabel(req: Record<string, unknown>): string {
  const n = getNumericTotalPrice(req);
  return n != null && Number.isFinite(n) ? formatUsd(n) : '—';
}

export default function Home() {
  const router = useRouter();
  const me = useAuthUserId();
  const onboardingOkRef = useRef<boolean | null>(null);
  const findSearchInputRef = useRef<TextInput>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [homeRentalCard, setHomeRentalCard] = useState<HomeActiveRentalCardModel | null>(null);

  const requests = useRequestsStore((s) => s.requests);
  const [listings, setListings] = useState<ToolListing[]>([]);

  const previewRequests = useMemo(
    () => listOpenRequestsSortedByDistance(requests).slice(0, PREVIEW_COUNT) as Record<string, unknown>[],
    [requests]
  );

  const previewListings = useMemo(() => {
    const sorted = [...listings].sort((a, b) => a.distance - b.distance);
    return sorted.slice(0, PREVIEW_COUNT);
  }, [listings]);

  useFocusEffect(
    useCallback(() => {
      touchLastActive();
      void refreshRequestsFromSupabase();
      fetchListings();

      const uid = me.trim();
      if (!uid) {
        setHomeRentalCard(null);
        return;
      }
      let cancelled = false;
      void (async () => {
        const rows = await fetchUnifiedRentalsForUser(uid);
        if (cancelled) return;
        setHomeRentalCard(selectHomeActiveRentalCardModel(rows, uid));
      })();
      return () => {
        cancelled = true;
      };
    }, [me])
  );

  useFocusEffect(
    useCallback(() => {
      if (onboardingOkRef.current === true) return;
      let cancelled = false;
      (async () => {
        const ok = await getOnboardingTermsAccepted();
        if (cancelled) return;
        if (ok) {
          onboardingOkRef.current = true;
          return;
        }
        router.replace('/onboarding-terms');
      })();
      return () => {
        cancelled = true;
      };
    }, [router])
  );

  const goBrowseRequests = useCallback(() => {
    router.push({ pathname: '/browse', params: { mode: 'requests' } });
  }, [router]);

  const goBrowseTools = useCallback(() => {
    router.push({ pathname: '/browse', params: { mode: 'tools' } });
  }, [router]);

  const updateSuggestions = useCallback((text: string) => {
    const t = text.toLowerCase();
    if (text.length === 0) {
      setSuggestions([]);
      return;
    }
    setSuggestions(
      EQUIPMENT_SUGGESTIONS.filter((item) => item.toLowerCase().includes(t)) as string[]
    );
  }, []);

  const exitFindSearch = useCallback(() => {
    setIsSearching(false);
    setQuery('');
    setSuggestions([]);
  }, []);

  const runBrowseToolsSearch = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) return;
      exitFindSearch();
      router.push({ pathname: '/browse', params: { mode: 'tools', query: trimmed } });
    },
    [exitFindSearch, router]
  );

  const onSelectSuggestion = useCallback(
    (label: string) => {
      setQuery(label);
      updateSuggestions(label);
      runBrowseToolsSearch(label);
    },
    [runBrowseToolsSearch, updateSuggestions]
  );

  useEffect(() => {
    if (!isSearching) return;
    const id = setTimeout(() => findSearchInputRef.current?.focus(), 80);
    return () => clearTimeout(id);
  }, [isSearching]);

  const goRequestEquipment = useCallback(() => {
    router.push('/request');
  }, [router]);

  const goRentOut = useCallback(() => {
    router.push('/listing');
  }, [router]);

  const goToRequestDetails = useCallback(
    (requestSupabaseId: string) => {
      router.push({
        pathname: '/request-details',
        params: { requestId: requestSupabaseId },
      });
    },
    [router]
  );

  const fetchListings = async () => {
    const r = await hydrateListingsFromSupabase();
    if (r.ok) {
      setListings([...useListingsStore.getState().listings]);
    }
  };
  const goToListingDetails = useCallback(
    (listingId: string) => {
      router.push({
        pathname: '/listing-detail',
        params: { listingId },
      });
    },
    [router]
  );

  return (
    <ScreenWrapper style={styles.screenWrap}>
      <View style={{ flex: 1 }}>
        <ScrollView
          style={styles.outer}
          contentContainerStyle={[
            styles.scrollInner,
            { paddingTop: ui.spaceMd, paddingBottom: 120 },
          ]}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.column}>
            <View style={styles.headerBlock}>
              <View
                style={styles.brandRow}
                accessible
                accessibilityRole="header"
                accessibilityLabel="Renby"
              >
                <Image
                  accessible={false}
                  source={require('@/assets/images/renby.png')}
                  style={styles.brandIcon}
                />
                <Text accessible={false} style={styles.brandName}>
                  Renby
                </Text>
              </View>
              <Text style={styles.heroSubtitle}>Rent Equipment and tools from people near you</Text>
            </View>

            <View style={styles.sectionCard}>
              <View>
                {!isSearching ? (
                  <Pressable
                    pressOpacityFeedback={false}
                    haptic
                    onPress={() => setIsSearching(true)}
                    style={({ pressed }) => [
                      styles.actionPrimary,
                      pressed && styles.actionPrimaryPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Find Equipment. Browse tools available to rent."
                  >
                    <Ionicons name="search-outline" size={28} color={ui.primaryOn} style={styles.actionIconPrimary} />
                    <Text style={styles.actionPrimaryLabel}>Find Equipment</Text>
                  </Pressable>
                ) : (
                  <View>
                    <View style={styles.findSearchBar}>
                      <Ionicons
                        name="search-outline"
                        size={28}
                        color={ui.primaryOn}
                        style={styles.actionIconPrimary}
                      />
                      <TextInput
                        ref={findSearchInputRef}
                        style={styles.findSearchInput}
                        placeholder="What do you need?"
                        placeholderTextColor="rgba(255,255,255,0.75)"
                        value={query}
                        onChangeText={(text) => {
                          setQuery(text);
                          updateSuggestions(text);
                        }}
                        returnKeyType="search"
                        onSubmitEditing={() => runBrowseToolsSearch(query)}
                        accessibilityLabel="Search equipment"
                      />
                      <Pressable
                        haptic
                        onPress={exitFindSearch}
                        style={({ pressed }) => [styles.findSearchCancel, pressed && styles.findSearchCancelPressed]}
                        accessibilityRole="button"
                        accessibilityLabel="Cancel search"
                      >
                        <Text style={styles.findSearchCancelLabel}>Cancel</Text>
                      </Pressable>
                    </View>
                    {query.length > 0 ? (
                      <View style={styles.suggestionsDropdown}>
                        {suggestions.length === 0 ? (
                          <Text style={styles.suggestionsEmpty}>No suggestions match</Text>
                        ) : (
                          suggestions.map((item) => (
                            <Pressable
                              key={item}
                              haptic
                              onPress={() => onSelectSuggestion(item)}
                              style={({ pressed }) => [
                                styles.suggestionRow,
                                pressed && styles.suggestionRowPressed,
                              ]}
                              accessibilityRole="button"
                              accessibilityLabel={`Search for ${item}`}
                            >
                              <Ionicons name="search-outline" size={18} color={ui.textSecondary} />
                              <Text style={styles.suggestionRowText}>{item}</Text>
                            </Pressable>
                          ))
                        )}
                      </View>
                    ) : null}
                  </View>
                )}

                <View style={styles.secondaryActionsGroup}>
                  <Pressable
                    haptic
                    onPress={goRequestEquipment}
                    style={({ pressed }) => [
                      styles.actionSecondary,
                      pressed && styles.actionSecondaryPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Request Equipment. Ask neighbors for a tool you need."
                  >
                    <Ionicons name="construct-outline" size={19} color={ui.primary} style={styles.actionIconSecondary} />
                    <Text style={styles.actionSecondaryLabel}>Request Equipment</Text>
                  </Pressable>

                  <Pressable
                    haptic
                    onPress={goRentOut}
                    style={({ pressed }) => [
                      styles.actionSecondary,
                      pressed && styles.actionSecondaryPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Rent Out Equipment. List a tool to earn money."
                  >
                    <Ionicons name="cube-outline" size={19} color={ui.primary} style={styles.actionIconSecondary} />
                    <Text style={styles.actionSecondaryLabel}>Rent Out Equipment</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            {homeRentalCard ? (
              <View style={styles.activeRentalCard}>
                <View style={styles.activeRentalHeaderRow}>
                  <View style={styles.activeRentalDot} importantForAccessibility="no" />
                  <Text
                    style={styles.activeRentalSectionLabel}
                    {...(Platform.OS === 'android' ? { includeFontPadding: false } : {})}
                  >
                    {homeRentalCard.sectionLabel}
                  </Text>
                </View>
                <Text
                  style={styles.activeRentalEquipment}
                  numberOfLines={2}
                  {...(Platform.OS === 'android' ? { includeFontPadding: false } : {})}
                >
                  {homeRentalCard.equipmentTitle}
                </Text>
                <Text
                  style={styles.activeRentalPrimary}
                  {...(Platform.OS === 'android' ? { includeFontPadding: false } : {})}
                >
                  {homeRentalCard.primaryLine}
                </Text>
                {homeRentalCard.detailLine ? (
                  <Text
                    style={styles.activeRentalDetail}
                    {...(Platform.OS === 'android' ? { includeFontPadding: false } : {})}
                  >
                    {homeRentalCard.detailLine}
                  </Text>
                ) : null}
                <Pressable
                  haptic
                  pressOpacityFeedback={false}
                  onPress={() => {
                    router.push(`/rental-wizard/${homeRentalCard.rentalId}`);
                  }}
                  style={({ pressed }) => [styles.activeRentalCta, pressed && styles.activeRentalCtaPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Continue rental"
                >
                  <Text style={styles.activeRentalCtaText}>Continue</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.sectionCard}>
              <View style={styles.sectionCardHeader}>
                <Text
                  style={styles.sectionHeading}
                  numberOfLines={2}
                  {...(Platform.OS === 'android' ? { includeFontPadding: false } : {})}
                >
                  People Near You Need Tools
                </Text>
                <Pressable
                  onPress={goBrowseRequests}
                  style={({ pressed }) => [styles.seeAllBtn, pressed && styles.seeAllBtnPressed]}
                >
                  <Text style={styles.seeAllText}>See All</Text>
                </Pressable>
              </View>
              {previewRequests.length === 0 ? (
                <View style={styles.emptyBlock}>
                  <View style={styles.emptyIconWrap}>
                    <Ionicons name="people-outline" size={28} color={ui.textSecondary} />
                  </View>
                  <Text style={styles.emptyMuted}>No requests yet.</Text>
                  <Text style={styles.emptyCtaLine}>Be the first to request something nearby</Text>
                  <Pressable
                    haptic
                    onPress={goRequestEquipment}
                    style={({ pressed }) => [styles.emptyCtaBtn, pressed && styles.emptyCtaBtnPressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Request Equipment"
                  >
                    <Text style={styles.emptyCtaBtnText}>Request Equipment</Text>
                  </Pressable>
                </View>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.previewScrollContent}
                >
                  {previewRequests.map((req, idx) => {
                    const ts = req.timestamp as number | undefined;
                    const detailsId = getRequestSupabaseRowId(req);
                    const title = String(req.toolName ?? '').trim() || 'Request';
                    const priceLabel = requestPriceLabel(req);
                    const distLabel = requestDistanceLabel(req);
                    const meta = `${priceLabel} · ${distLabel}`;
                    return (
                      <CardPressable
                        key={ts != null ? String(ts) : `req-${idx}`}
                        onPress={() => {
                          if (!detailsId) return;
                          goToRequestDetails(detailsId);
                        }}
                        disabled={!detailsId}
                        style={({ pressed }) => [
                          styles.previewCard,
                          pressed && detailsId != null && styles.previewCardPressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`${title}, ${meta}`}
                      >
                        <Text style={styles.previewTitle} numberOfLines={2}>
                          {title}
                        </Text>
                        <Text style={styles.previewMeta} numberOfLines={1}>
                          <Text style={styles.previewPrice}>{priceLabel}</Text>
                          <Text style={styles.previewMetaRest}> · {distLabel}</Text>
                        </Text>
                      </CardPressable>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionCardHeader}>
                <Text
                  style={styles.sectionHeading}
                  numberOfLines={2}
                  {...(Platform.OS === 'android' ? { includeFontPadding: false } : {})}
                >
                  Equipment Available to Rent
                </Text>
                <Pressable
                  onPress={goBrowseTools}
                  style={({ pressed }) => [styles.seeAllBtn, pressed && styles.seeAllBtnPressed]}
                >
                  <Text style={styles.seeAllText}>See All</Text>
                </Pressable>
              </View>
              {previewListings.length === 0 ? (
                <View style={styles.emptyBlock}>
                  <View style={styles.emptyIconWrap}>
                    <Ionicons name="hammer-outline" size={28} color={ui.textSecondary} />
                  </View>
                  <Text style={styles.emptyMuted}>No listings yet.</Text>
                  <Text style={styles.emptyCtaLine}>List your first tool and start earning</Text>
                  <Pressable
                    haptic
                    onPress={goRentOut}
                    style={({ pressed }) => [styles.emptyCtaBtn, pressed && styles.emptyCtaBtnPressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Rent Out Equipment"
                  >
                    <Text style={styles.emptyCtaBtnText}>Rent Out Equipment</Text>
                  </Pressable>
                </View>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.previewScrollContent}
                >
                  {previewListings.map((item: ToolListing) => (
  <CardPressable
    key={item.id}
    onPress={() => goToListingDetails(item.id)}
    style={({ pressed }) => [
      styles.previewCard,
      pressed && styles.previewCardPressed,
    ]}
    accessibilityRole="button"
    accessibilityLabel={`${item.name}, ${formatListingPriceWithUnit(item.price, item.priceUnit)}, ${formatMilesShort(item.distance)}`}
  >

    {/* ✅ IMAGE GOES HERE */}
    {item.images?.[0] ? (
      <Image
        source={{ uri: item.images[0] }}
        style={{ width: '100%', height: 120, borderRadius: 12, marginBottom: 8 }}
      />
    ) : (
      <View
        style={{
          width: '100%',
          height: 120,
          borderRadius: 12,
          backgroundColor: '#E5E7EB',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 8,
        }}
      >
        <Ionicons name="image-outline" size={28} color="#9CA3AF" />
      </View>
    )}

    <Text style={styles.previewTitle} numberOfLines={2}>
      {item.name}
    </Text>

    <Text style={styles.previewMeta} numberOfLines={1}>
      <Text style={styles.previewPrice}>
        {formatListingPriceWithUnit(item.price, item.priceUnit)}
      </Text>
      <Text style={styles.previewMetaRest}>
        {' '}
        · {formatMilesShort(item.distance)}
      </Text>
    </Text>

    {item.description?.trim() ? (
      <Text style={styles.previewDesc} numberOfLines={1}>
        {item.description.trim()}
      </Text>
    ) : null}

  </CardPressable>
))}
                </ScrollView>
              )}
            </View>
           <HomeMarketing />
          </View>
        
        </ScrollView>
        <MainTabFab />
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  screenWrap: {
    backgroundColor: ui.surfaceGrouped,
  },
  outer: {
    flex: 1,
    backgroundColor: ui.surfaceGrouped,
  },
  scrollInner: {
    flexGrow: 1,
    alignItems: 'stretch',
    paddingHorizontal: 0,
  },
  column: {
    width: '100%',
  },
  headerBlock: {
    paddingHorizontal: 0,
    paddingTop: 12,
    paddingBottom: 8,
    marginBottom: 16,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  brandIcon: {
    width: 40,
    height: 40,
    resizeMode: 'contain',
  },
  brandName: {
    marginLeft: 8,
    fontSize: 22,
    fontWeight: '700',
    color: ui.textPrimary,
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    lineHeight: 20,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: SECTION_CARD_PADDING,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    ...shadowCard,
  },
  secondaryActionsGroup: {
    marginTop: 16,
    gap: ui.spaceSm,
  },
  actionPrimary: {
    width: '100%',
    minHeight: PRIMARY_ACTION_MIN_H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundColor: ui.primary,
    borderRadius: ui.radiusProminent,
    paddingVertical: 20,
    paddingHorizontal: ui.spaceMd + 4,
    ...shadowKey,
    elevation: 6,
  },
  actionPrimaryPressed: {
    ...primarySolidPressed,
  },
  findSearchBar: {
    width: '100%',
    minHeight: PRIMARY_ACTION_MIN_H,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ui.primary,
    borderRadius: ui.radiusProminent,
    paddingVertical: 12,
    paddingHorizontal: ui.spaceMd + 4,
    ...shadowKey,
    elevation: 6,
  },
  findSearchInput: {
    flex: 1,
    minHeight: 28,
    paddingVertical: 4,
    paddingTop: 2,
    paddingHorizontal: 0,
    marginRight: 8,
    fontSize: 19,
    fontWeight: '600',
    color: ui.primaryOn,
    letterSpacing: -0.35,
  },
  findSearchCancel: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    justifyContent: 'center',
  },
  findSearchCancelPressed: {
    opacity: ui.pressOpacity,
  },
  findSearchCancelLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.primaryOn,
  },
  suggestionsDropdown: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
  },
  suggestionRowPressed: {
    backgroundColor: ui.surfaceStriped,
  },
  suggestionRowText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: ui.textPrimary,
  },
  suggestionsEmpty: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    fontSize: 15,
    color: ui.textSecondary,
  },
  actionIconPrimary: {
    marginRight: 12,
  },
  actionPrimaryLabel: {
    fontSize: 19,
    fontWeight: '700',
    color: ui.primaryOn,
    letterSpacing: -0.35,
  },
  actionSecondary: {
    width: '100%',
    minHeight: SECONDARY_ACTION_MIN_H,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ui.surfaceInput,
    borderRadius: ui.radiusButton,
    paddingVertical: 10,
    paddingHorizontal: ui.spaceMd,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  actionSecondaryPressed: {
    backgroundColor: ui.surfaceStriped,
  },
  actionIconSecondary: {
    marginRight: 10,
  },
  actionSecondaryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.textPrimary,
    letterSpacing: -0.12,
  },
  activeRentalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: SECTION_CARD_PADDING,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    ...shadowCard,
  },
  activeRentalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  activeRentalDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },
  activeRentalSectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: ui.textSecondary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  activeRentalEquipment: {
    fontSize: 18,
    fontWeight: '800',
    color: ui.textPrimary,
    letterSpacing: -0.35,
    lineHeight: 24,
    marginBottom: 8,
  },
  activeRentalPrimary: {
    fontSize: 15,
    fontWeight: '600',
    color: ui.textPrimary,
    lineHeight: 22,
    marginBottom: 8,
  },
  activeRentalDetail: {
    fontSize: 14,
    fontWeight: '500',
    color: ui.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  activeRentalCta: {
    marginTop: 8,
    minHeight: 48,
    borderRadius: ui.radiusButton,
    backgroundColor: ui.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: ui.spaceMd,
    ...shadowKey,
  },
  activeRentalCtaPressed: {
    ...primarySolidPressed,
  },
  activeRentalCtaText: {
    fontSize: 15,
    fontWeight: '700',
    color: ui.primaryOn,
    letterSpacing: -0.2,
  },
  sectionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: ui.spaceSm + 2,
  },
  sectionHeading: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: ui.textPrimary,
    letterSpacing: -0.3,
    lineHeight: 24,
    paddingRight: 8,
  },
  seeAllBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  seeAllBtnPressed: {
    opacity: ui.pressOpacity,
  },
  seeAllText: {
    fontSize: 15,
    fontWeight: '600',
    color: ui.primary,
    lineHeight: 22,
  },
  previewScrollContent: {
    paddingBottom: 2,
  },
  previewCard: {
    width: PREVIEW_CARD_WIDTH,
    marginRight: 14,
    ...cardChrome,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  previewCardPressed: {
    backgroundColor: ui.surfaceStriped,
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: ui.textPrimary,
    lineHeight: 20,
    marginBottom: 8,
    minHeight: 40,
  },
  previewMeta: {
    lineHeight: 22,
  },
  previewPrice: {
    fontSize: ui.fontPrice,
    fontWeight: '600',
    color: ui.textPrimary,
  },
  previewMetaRest: {
    fontSize: ui.fontSubtle,
    fontWeight: '500',
    color: ui.textSecondary,
  },
  previewDesc: {
    fontSize: 13,
    fontWeight: '500',
    color: ui.textSecondary,
    lineHeight: 18,
    marginTop: 6,
  },
  emptyBlock: {
    paddingTop: 4,
    paddingBottom: 2,
    alignItems: 'center',
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: ui.surfaceNeutral,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: ui.spaceSm + 2,
  },
  emptyMuted: {
    fontSize: ui.fontSubtle,
    fontWeight: '500',
    color: ui.textSecondary,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 6,
  },
  emptyCtaLine: {
    fontSize: ui.fontBody,
    fontWeight: '600',
    color: ui.textPrimary,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  emptyCtaBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: ui.radiusChip,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.primary,
    backgroundColor: ui.surfaceTintPrimary,
  },
  emptyCtaBtnPressed: {
    backgroundColor: ui.surfaceStriped,
    opacity: 0.95,
  },
  emptyCtaBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.primary,
    letterSpacing: -0.1,
  },
});
