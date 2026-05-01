import { useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from '@/components/KeyboardDismissScreen';
import { Pressable } from '@/components/Pressable';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ui } from '@/constants/appUi';
import { useAuthUserId } from '@/lib/authUser';
import { formatMilesShort } from '@/lib/requestDistance';
import type { ToolListing } from '@/store/listingsStore';
import {
  formatListingPriceWithUnit,
  useListingsStore,
} from '@/store/listingsStore';

/** Browse/supabase rows attach `images` at runtime; store type stays unchanged. */
type ListingDetailRow = ToolListing & { images?: string[] };

const HERO_HEIGHT = 280;

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export default function ListingDetailScreen() {
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
        <KeyboardDismissScreen style={[styles.screen, styles.centered]}>
          <ScreenEntrance style={styles.entranceFillCentered}>
            <Text style={styles.notFound}>Listing not found</Text>
          </ScreenEntrance>
        </KeyboardDismissScreen>
      </ScreenWrapper>
    );
  }

  const row = listing as ListingDetailRow;
  const firstImageUri = row.images?.[0]?.trim();
  const description = listing.description?.trim() ?? '';
  const isOwnListing =
    Boolean(currentUserId) &&
    Boolean(listing.ownerUserId) &&
    listing.ownerUserId === currentUserId;

  return (
    <ScreenWrapper style={styles.screenWrap}>
      <KeyboardDismissScreen style={styles.screen}>
        <ScreenEntrance style={styles.entranceFlex}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: 24 + insets.bottom },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.heroWrap}>
              {firstImageUri ? (
                <Image
                  source={{ uri: firstImageUri }}
                  style={styles.heroImage}
                  resizeMode="cover"
                  accessibilityRole="image"
                />
              ) : (
                <View style={styles.heroPlaceholder} />
              )}
            </View>

            <View style={styles.contentBlock}>
              <Text style={styles.title}>{listing.name}</Text>
              <Text style={styles.price}>
                {formatListingPriceWithUnit(listing.price, listing.priceUnit)}
              </Text>
              <Text style={styles.distance}>
                {formatMilesShort(listing.distance)}
              </Text>
              {isOwnListing ? (
                <Text style={styles.yourListing}>Your listing</Text>
              ) : null}
            </View>

            {description ? (
              <View style={styles.descSection}>
                <Text style={styles.description}>{listing.description}</Text>
              </View>
            ) : null}

            <Pressable
              pressOpacityFeedback={false}
              haptic
              onPress={() => {
                console.log(listingId);
              }}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.primaryBtnPressed,
              ]}
            >
              <Text style={styles.primaryBtnText}>Request Rental</Text>
            </Pressable>
          </ScrollView>
        </ScreenEntrance>
      </KeyboardDismissScreen>
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
  },
  heroImage: {
    width: '100%',
    height: HERO_HEIGHT,
    backgroundColor: ui.surfaceNeutral,
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
});
