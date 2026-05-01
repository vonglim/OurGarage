import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from '@/components/KeyboardDismissScreen';
import { showFeedbackToast } from '@/store/feedbackToastStore';
import { Pressable } from '@/components/Pressable';
import { ScreenBackButton } from '@/components/ScreenBackButton';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { cardChrome, outlinePrimaryPressed, primarySolidPressed, ui } from '@/constants/appUi';
import {
  formatRenbyDistance,
  formatRenbyPricePerDay,
  getRenbyListingById,
} from '@/lib/renbyListings';

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function ownerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0][0];
    const b = parts[parts.length - 1][0];
    if (a && b) return (a + b).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || '?';
}

const windowWidth = Dimensions.get('window').width;
const HERO_HEIGHT = Math.min(340, Math.round(windowWidth * 0.82));
/** Space so scroll content clears the fixed dual-CTA footer (~two buttons + padding). */
const SCROLL_FOOTER_PAD = 132;

export default function RenbyListingDetailScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = firstParam(params.id);

  const listing = useMemo(() => (id ? getRenbyListingById(id) : undefined), [id]);

  const onRequestToRent = () => {
    if (!listing) return;
    router.push({
      pathname: '/request',
      params: {
        prefillToolName: listing.title,
        prefillPrice: String(listing.pricePerDay),
      },
    });
  };

  const onMessageOwner = () => {
    showFeedbackToast('Opening messages (demo)');
  };

  if (!id || !listing) {
    return (
      <KeyboardDismissScreen style={[styles.screen, styles.centered]}>
        <ScreenEntrance style={styles.entranceFillCentered}>
          <Text style={styles.muted}>Listing not found.</Text>
          <ScreenBackButton
            onPress={() => router.back()}
            style={styles.notFoundBack}
          />
        </ScreenEntrance>
      </KeyboardDismissScreen>
    );
  }

  return (
    <KeyboardDismissScreen style={styles.screen}>
      <ScreenEntrance style={styles.entranceFlex}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <ScreenBackButton onPress={() => router.back()} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: SCROLL_FOOTER_PAD + insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Image
            source={{ uri: listing.imageUrl }}
            style={[styles.hero, { height: HERO_HEIGHT }]}
            contentFit="cover"
            transition={200}
          />

          <View style={styles.bodyGutter}>
            <Text style={styles.price}>{formatRenbyPricePerDay(listing.pricePerDay)}</Text>
            <Text style={styles.title}>{listing.title}</Text>

            <View style={styles.ownerRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{ownerInitials(listing.ownerName)}</Text>
              </View>
              <View style={styles.ownerMeta}>
                <Text style={styles.ownerName}>{listing.ownerName}</Text>
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={14} color="#CA8A04" />
                  <Text style={styles.ratingText}>{listing.ownerRating.toFixed(1)}</Text>
                  <Text style={styles.ratingSub}>· Host on Renby</Text>
                </View>
              </View>
            </View>

            <View style={styles.sectionGapSm} />

            <View style={styles.locationCard}>
              <View style={styles.locationIconWrap}>
                <Ionicons name="location-outline" size={22} color={ui.primary} />
              </View>
              <View style={styles.locationTextBlock}>
                <Text style={styles.locationPrimary}>
                  {listing.locationArea}
                  <Text style={styles.locationMuted}> · </Text>
                  {listing.locationCity}
                </Text>
                <Text style={styles.distanceLine}>{formatRenbyDistance(listing.distanceMiles)}</Text>
              </View>
            </View>

            <View style={styles.sectionGap} />
            <Text style={styles.sectionLabel}>About this listing</Text>
            <View style={styles.descCard}>
              <Text style={styles.body}>{listing.description}</Text>
            </View>
          </View>
        </ScrollView>

        <View
          style={[
            styles.footer,
            {
              paddingBottom: Math.max(insets.bottom, 12),
              paddingTop: 12,
            },
          ]}
        >
          <Pressable
            pressOpacityFeedback={false}
            haptic
            onPress={onRequestToRent}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
          >
            <Text style={styles.primaryBtnText}>Request to Rent</Text>
          </Pressable>
          <Pressable
            pressOpacityFeedback={false}
            haptic
            onPress={onMessageOwner}
            style={({ pressed }) => [styles.outlineBtn, pressed && styles.outlineBtnPressed]}
          >
            <Text style={styles.outlineBtnText}>Message Owner</Text>
          </Pressable>
        </View>
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
    color: ui.textSecondary,
    marginBottom: 16,
    textAlign: 'center',
  },
  notFoundBack: {
    alignSelf: 'center',
    marginTop: 4,
  },
  header: {
    paddingHorizontal: ui.padScreenH,
    paddingBottom: 8,
    backgroundColor: ui.surfaceGrouped,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  hero: {
    width: windowWidth,
    backgroundColor: ui.surfaceInput,
  },
  bodyGutter: {
    paddingHorizontal: ui.padScreenH,
    paddingTop: ui.spaceMd + 4,
  },
  price: {
    fontSize: 28,
    fontWeight: '700',
    color: ui.primary,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: ui.textPrimary,
    letterSpacing: -0.4,
    lineHeight: 28,
    marginBottom: ui.spaceMd,
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: ui.surfaceTintPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: ui.primary,
  },
  ownerMeta: {
    flex: 1,
    minWidth: 0,
  },
  ownerName: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.textPrimary,
    marginBottom: 2,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.textPrimary,
  },
  ratingSub: {
    fontSize: 13,
    color: ui.textSecondary,
  },
  sectionGapSm: {
    height: ui.spaceMd,
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    ...cardChrome,
    paddingVertical: 14,
  },
  locationIconWrap: {
    marginTop: 2,
  },
  locationTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  locationPrimary: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.textPrimary,
    lineHeight: 22,
  },
  locationMuted: {
    fontWeight: '400',
    color: ui.textSecondary,
  },
  distanceLine: {
    marginTop: 4,
    fontSize: 14,
    color: ui.textSecondary,
  },
  sectionGap: {
    height: ui.spaceSection - 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  descCard: {
    ...cardChrome,
  },
  body: {
    fontSize: 16,
    color: ui.textPrimary,
    lineHeight: 25,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: ui.padScreenH,
    gap: 10,
    backgroundColor: ui.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ui.border,
  },
  primaryBtn: {
    paddingVertical: 15,
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
  outlineBtn: {
    paddingVertical: 15,
    borderRadius: ui.radiusButton,
    borderWidth: 1.5,
    borderColor: ui.primary,
    alignItems: 'center',
    backgroundColor: ui.background,
  },
  outlineBtnPressed: {
    ...outlinePrimaryPressed,
  },
  outlineBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: ui.primary,
  },
});
