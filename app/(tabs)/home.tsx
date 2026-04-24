import { cardChrome, primarySolidPressed, shadowCard, shadowKey, ui } from '@/constants/appUi';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef } from 'react';
import { Image, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CardPressable } from '@/components/CardPressable';
import { Pressable } from '@/components/Pressable';

import { KeyboardDismissScreen } from '@/components/KeyboardDismissScreen';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { MainTabFab, useMainTabFabBottomReserve } from '@/components/MainTabFab';
import { formatUsd, getNumericTotalPrice } from '@/lib/money';
import { listOpenRequestsSortedByDistance } from '@/lib/openRequestsForBrowse';
import { getRequestSupabaseRowId } from '@/lib/requestOwnership';
import { formatMilesShort, milesFromViewerToRequest } from '@/lib/requestDistance';
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
  const fabBottomReserve = useMainTabFabBottomReserve();
  const onboardingOkRef = useRef<boolean | null>(null);

  const requests = useRequestsStore((s) => s.requests);
  const listings = useListingsStore((s) => s.listings);

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
    }, [])
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

  const goRequestEquipment = useCallback(() => {
    router.push('/request');
  }, [router]);

  const goRentOut = useCallback(() => {
    router.push('/rent-out');
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
      <KeyboardDismissScreen>
        <View style={styles.screenInner}>
          <ScrollView
            style={styles.outer}
            contentContainerStyle={[
              styles.scrollInner,
              { paddingTop: ui.spaceMd, paddingBottom: fabBottomReserve },
            ]}
            keyboardShouldPersistTaps="handled"
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
                <Pressable
                  pressOpacityFeedback={false}
                  haptic
                  onPress={goBrowseTools}
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
                        <Text
                          style={styles.previewDesc}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          {item.description.trim()}
                        </Text>
                      ) : null}
                    </CardPressable>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        </ScrollView>
        <MainTabFab />
      </View>
    </KeyboardDismissScreen>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  screenWrap: {
    backgroundColor: ui.surfaceGrouped,
  },
  screenInner: {
    flex: 1,
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    marginBottom: 16,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'flex-start',
  },
  brandIcon: {
    width: 36,
    height: 36,
    resizeMode: 'contain',
  },
  brandName: {
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
    justifyContent: 'center',
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
  actionIconPrimary: {
    marginRight: 12,
  },
  actionPrimaryLabel: {
    fontSize: 19,
    fontWeight: '800',
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
