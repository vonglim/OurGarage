import { cardChrome, primarySolidPressed, shadowCard, shadowKey, ui } from '@/constants/appUi';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef } from 'react';
import { Button, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CardPressable } from '@/components/CardPressable';
import { Pressable } from '@/components/Pressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from '@/components/KeyboardDismissScreen';
import { MainTabFab, useMainTabFabBottomReserve } from '@/components/MainTabFab';
import { supabase } from '../../lib/supabase';
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
  const insets = useSafeAreaInsets();
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
    <KeyboardDismissScreen>
      <View style={styles.screenInner}>
        <ScrollView
          style={styles.outer}
          contentContainerStyle={[
            styles.scrollInner,
            { paddingTop: ui.spaceMd + insets.top, paddingBottom: fabBottomReserve },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.column}>
            <Text style={styles.title}>OurGarage</Text>

            <Button
              title="Force Logout"
              onPress={async () => {
                await supabase.auth.signOut();
                console.log('SIGNED OUT');
              }}
            />

            <View style={styles.actionsBlock}>
              <Pressable
                pressOpacityFeedback={false}
                haptic
                onPress={goBrowseTools}
                style={({ pressed }) => [
                  styles.actionCardPrimary,
                  pressed && styles.actionCardPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Find Equipment. Need equipement or a tool, search here."
              >
                <Text style={styles.actionTitleOnPrimary}>Find Equipment</Text>
                <Text style={styles.actionSubtitleOnPrimary}>
                  Need equipment or a tool?
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.push('/list-my-tool')}
                style={({ pressed }) => [
                  styles.actionCardSecondary,
                  pressed && styles.actionCardSecondaryPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Rent out equipment. Make money from what you rarely use."
              >
                <Text style={styles.actionTitleSecondary}>Rent Out Equipment</Text>
                <Text style={styles.actionSubtitleSecondary}>
                  Make money from what you rarely use
                </Text>
              </Pressable>
            </View>

            <View style={styles.previewRegion}>
              <View style={styles.section}>
                <View style={styles.sectionTitleRow}>
                  <Text
                    style={styles.sectionHeading}
                    numberOfLines={2}
                    {...(Platform.OS === 'android' ? { includeFontPadding: false } : {})}
                  >
                    People Looking For Equipment
                  </Text>
                  <Pressable
                    onPress={goBrowseRequests}
                    style={({ pressed }) => [styles.seeAllBtn, pressed && styles.seeAllBtnPressed]}
                  >
                    <Text style={styles.seeAllText}>See All</Text>
                  </Pressable>
                </View>
                {previewRequests.length === 0 ? (
                  <Text style={styles.emptyHint}>No open requests right now.</Text>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: ui.spaceMd }}
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

              <View style={styles.section}>
                <View style={styles.sectionTitleRow}>
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
                  <Text style={styles.emptyHint}>No listings yet.</Text>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: ui.spaceMd }}
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
          </View>
        </ScrollView>
        <MainTabFab />
      </View>
    </KeyboardDismissScreen>
  );
}

const styles = StyleSheet.create({
  screenInner: {
    flex: 1,
  },
  outer: {
    flex: 1,
    backgroundColor: ui.background,
  },
  scrollInner: {
    flexGrow: 1,
    alignItems: 'stretch',
    paddingHorizontal: ui.padScreenH,
  },
  column: {
    width: '100%',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: ui.spaceSection,
    color: ui.textPrimary,
    textAlign: 'center',
  },
  actionsBlock: {
    width: '100%',
    gap: ui.spaceSection,
    marginBottom: ui.spaceLg,
  },
  actionCardPrimary: {
    width: '100%',
    backgroundColor: ui.primary,
    borderRadius: ui.radiusProminent,
    paddingVertical: ui.spaceLg,
    paddingHorizontal: ui.spaceSection,
    alignItems: 'center',
    ...shadowKey,
  },
  actionCardSecondary: {
    width: '100%',
    backgroundColor: cardChrome.backgroundColor,
    borderRadius: ui.radiusCard,
    paddingVertical: ui.padButtonV,
    paddingHorizontal: ui.spaceSection,
    alignItems: 'center',
    borderWidth: cardChrome.borderWidth,
    borderColor: ui.border,
    ...shadowCard,
    elevation: 2,
  },
  actionCardPressed: {
    ...primarySolidPressed,
  },
  actionCardSecondaryPressed: {
    opacity: 0.96,
    backgroundColor: ui.surfaceStriped,
  },
  actionTitleOnPrimary: {
    fontSize: 24,
    fontWeight: '700',
    color: ui.primaryOn,
    letterSpacing: -0.35,
    marginBottom: 8,
    textAlign: 'center',
  },
  actionSubtitleOnPrimary: {
    fontSize: 17,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
    lineHeight: 24,
  },
  actionTitleSecondary: {
    fontSize: 17,
    fontWeight: '700',
    color: ui.textPrimary,
    letterSpacing: -0.2,
    marginBottom: 4,
    textAlign: 'center',
  },
  actionSubtitleSecondary: {
    fontSize: 13,
    fontWeight: '500',
    color: ui.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  previewRegion: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ui.border,
  },
  section: {
    marginTop: ui.spaceSection,
    marginBottom: ui.spaceSection,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: ui.spaceMd,
    gap: ui.spaceSm + 2,
  },
  sectionHeading: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: ui.textPrimary,
    letterSpacing: -0.25,
    lineHeight: 22,
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
  previewCard: {
    width: PREVIEW_CARD_WIDTH,
    marginRight: 14,
    ...cardChrome,
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
  emptyHint: {
    fontSize: 14,
    color: ui.textSecondary,
    lineHeight: 20,
  },
});
