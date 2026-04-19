import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { cardChrome, ui } from '@/constants/appUi';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from '../components/KeyboardDismissScreen';
import { MainTabFab, useMainTabFabBottomReserve } from '../components/MainTabFab';
import { listOpenRequestsSortedByDistance } from '../lib/openRequestsForBrowse';
import { formatUsd, getNumericTotalPrice } from '../lib/money';
import { formatMilesShort, milesFromViewerToRequest } from '../lib/requestDistance';
import { getOnboardingTermsAccepted } from '../store/agreementsStore';
import { touchLastActive } from '../store/profileStore';
import { useRequestsStore } from '../store/requestsStore';
import type { ToolListing } from '../store/listingsStore';
import { formatListingPriceWithUnit, useListingsStore } from '../store/listingsStore';

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
    (requestTimestamp: number) => {
      router.push({
        pathname: '/request-details',
        params: { requestId: String(requestTimestamp) },
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
            { paddingTop: 16 + insets.top, paddingBottom: fabBottomReserve },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.column}>
            <Text style={styles.title}>OurGarage</Text>

            <View style={styles.actionsBlock}>
              <Pressable
                onPress={goBrowseTools}
                style={({ pressed }) => [
                  styles.actionCardPrimary,
                  pressed && styles.actionCardPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Find Equipment. Things you need, without buying."
              >
                <Text style={styles.actionTitleOnPrimary}>Find Equipment</Text>
                <Text style={styles.actionSubtitleOnPrimary}>
                  Things you need, without buying
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
                    contentContainerStyle={{ paddingHorizontal: 16 }}
                  >
                    {previewRequests.map((req, idx) => {
                      const ts = req.timestamp as number | undefined;
                      const title = String(req.toolName ?? '').trim() || 'Request';
                      const meta = `${requestPriceLabel(req)} · ${requestDistanceLabel(req)}`;
                      return (
                        <Pressable
                          key={ts != null ? String(ts) : `req-${idx}`}
                          onPress={() => {
                            if (ts == null) return;
                            goToRequestDetails(ts);
                          }}
                          disabled={ts == null}
                          style={({ pressed }) => [
                            styles.previewCard,
                            pressed && styles.previewCardPressed,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`${title}, ${meta}`}
                        >
                          <Text style={styles.previewTitle} numberOfLines={2}>
                            {title}
                          </Text>
                          <Text style={styles.previewMeta} numberOfLines={1}>
                            {meta}
                          </Text>
                        </Pressable>
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
                    contentContainerStyle={{ paddingHorizontal: 16 }}
                  >
                    {previewListings.map((item: ToolListing) => (
                      <Pressable
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
                          {`${formatListingPriceWithUnit(item.price, item.priceUnit)} · ${formatMilesShort(item.distance)}`}
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
                      </Pressable>
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
    backgroundColor: '#FFFFFF',
  },
  scrollInner: {
    flexGrow: 1,
    alignItems: 'stretch',
    paddingHorizontal: 20,
  },
  column: {
    width: '100%',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: 20,
    color: '#000',
    textAlign: 'center',
  },
  actionsBlock: {
    width: '100%',
    gap: 24,
    marginBottom: 32,
  },
  actionCardPrimary: {
    width: '100%',
    backgroundColor: ui.primary,
    borderRadius: 20,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 5,
  },
  actionCardSecondary: {
    width: '100%',
    backgroundColor: cardChrome.backgroundColor,
    borderRadius: cardChrome.borderRadius,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: cardChrome.borderWidth,
    borderColor: 'rgba(60, 60, 67, 0.22)',
    shadowColor: cardChrome.shadowColor,
    shadowOffset: cardChrome.shadowOffset,
    shadowOpacity: cardChrome.shadowOpacity * 0.75,
    shadowRadius: cardChrome.shadowRadius,
    elevation: 2,
  },
  actionCardPressed: {
    opacity: ui.pressOpacity,
  },
  actionCardSecondaryPressed: {
    opacity: 0.96,
    backgroundColor: '#F5F5F7',
  },
  actionTitleOnPrimary: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
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
    fontWeight: '600',
    color: '#3A3A3C',
    letterSpacing: -0.2,
    marginBottom: 4,
    textAlign: 'center',
  },
  actionSubtitleSecondary: {
    fontSize: 13,
    fontWeight: '500',
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 18,
  },
  previewRegion: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5EA',
  },
  section: {
    marginTop: 24,
    marginBottom: 22,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 10,
  },
  sectionHeading: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1C1E',
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
    opacity: 0.9,
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1C1C1E',
    lineHeight: 20,
    marginBottom: 8,
    minHeight: 40,
  },
  previewMeta: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3C3C43',
    lineHeight: 18,
  },
  previewDesc: {
    fontSize: 13,
    fontWeight: '500',
    color: '#8E8E93',
    lineHeight: 18,
    marginTop: 6,
  },
  emptyHint: {
    fontSize: 14,
    color: '#AEAEB2',
    lineHeight: 20,
  },
});
