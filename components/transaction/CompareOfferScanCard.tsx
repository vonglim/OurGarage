import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Pressable } from '@/components/Pressable';
import { AppImage } from '@/components/ui/AppImage';
import {
  marketplaceCompareElevation,
  marketplaceCardPlatformShadow,
  marketplaceOfferCard,
  marketplaceTypography,
  radius,
  semantic,
  type MarketplaceCompareCardVariant,
} from '@/constants/designTokens';
import { ui } from '@/constants/appUi';

export type CompareOfferScanCardProps = {
  variant?: MarketplaceCompareCardVariant;
  ownerName: string;
  ratingLine?: string | null;
  showBestValueBadge?: boolean;
  pricePrimary: string;
  priceSubline: string;
  deliveryMeta: string;
  distanceMeta: string;
  areaMeta: string;
  listingTitle: string;
  previewLine?: string | null;
  timeAgo: string;
  listingImageUri?: string | null;
  onPress: () => void;
};

function avatarBackground(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i) * 13) % 360;
  return `hsl(${h}, 38%, 90%)`;
}

const TH = marketplaceOfferCard.thumb;
const AV = marketplaceOfferCard.avatar;

export function CompareOfferScanCard({
  variant = 'neutral',
  ownerName,
  ratingLine,
  showBestValueBadge,
  pricePrimary,
  priceSubline,
  deliveryMeta,
  distanceMeta,
  areaMeta,
  listingTitle,
  previewLine,
  timeAgo,
  listingImageUri,
  onPress,
}: CompareOfferScanCardProps) {
  const uri = listingImageUri?.trim() ?? '';
  const hasImage = uri.length > 0;
  const elev = marketplaceCompareElevation[variant];
  const restShadow = elev.shadowOpacity;
  const pressedShadow = elev.pressShadowOpacityPressed;

  const press = useSharedValue(0);
  const onPressIn = () => {
    press.value = withTiming(1, {
      duration: marketplaceOfferCard.pressAnimMs,
      easing: Easing.out(Easing.quad),
    });
  };
  const onPressOut = () => {
    press.value = withTiming(0, {
      duration: marketplaceOfferCard.pressAnimMs,
      easing: Easing.out(Easing.quad),
    });
  };

  const cardAnim = useAnimatedStyle(() => {
    const scale = interpolate(press.value, [0, 1], [1, marketplaceOfferCard.pressScale]);
    if (Platform.OS === 'android') {
      return { transform: [{ scale }] };
    }
    return {
      transform: [{ scale }],
      shadowOpacity: interpolate(press.value, [0, 1], [restShadow, pressedShadow]),
    };
  });

  const dimAnim = useAnimatedStyle(() => ({
    opacity: interpolate(press.value, [0, 1], [0, 1]),
  }));

  const platformShadow = marketplaceCardPlatformShadow(variant);
  const logisticsLine = `${deliveryMeta} · ${distanceMeta}`;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      haptic
      pressOpacityFeedback={false}
      accessibilityRole="button"
      accessibilityLabel={`Offer from ${ownerName}, total ${pricePrimary}. Tap to open negotiation.`}
      style={styles.outer}
    >
      <Animated.View
        style={[
          styles.card,
          {
            borderRadius: marketplaceOfferCard.radius,
            paddingHorizontal: marketplaceOfferCard.paddingH,
            paddingVertical: marketplaceOfferCard.paddingV,
            borderColor: elev.borderColor,
            borderWidth: elev.borderWidth,
            backgroundColor:
              variant === 'best' ? marketplaceCompareElevation.best.cardSurfaceTint : ui.cardBg,
          },
          platformShadow,
          cardAnim,
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[styles.pressDim, dimAnim]}
          accessibilityElementsHidden
        />

        {/* TOP ROW: lender identity left, price top-right (locked anatomy) */}
        <View style={styles.topRow}>
          <View style={styles.topLeft}>
            <View style={[styles.avatar, { backgroundColor: avatarBackground(ownerName) }]}>
              <Ionicons name="person" size={19} color={ui.textSecondary} accessibilityElementsHidden />
            </View>
            <View style={styles.ownerTextCol}>
              <View style={styles.nameBadgeRow}>
                <Text style={styles.ownerName} numberOfLines={1}>
                  {ownerName}
                </Text>
                {showBestValueBadge ? (
                  <View style={styles.bestValuePill}>
                    <Text style={styles.bestValuePillText}>Best value</Text>
                  </View>
                ) : null}
              </View>
              {ratingLine ? (
                <Text style={styles.ratingLine} numberOfLines={1}>
                  {ratingLine}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={styles.topRightPrice}>
            <Text style={styles.totalLabel}>TOTAL</Text>
            <Text style={styles.totalPrice} numberOfLines={1}>
              {pricePrimary}
            </Text>
            <Text style={styles.priceSub} numberOfLines={2}>
              {priceSubline}
            </Text>
          </View>
        </View>

        {/* SECOND ROW: item preview */}
        <View style={styles.listingRow}>
          <View style={styles.thumbClip}>
            {hasImage ? (
              <AppImage
                uri={uri}
                aspect="square"
                width={TH}
                rounded={radius.thumbMarketplace}
                accessibilityLabel="Listing photo"
              />
            ) : (
              <View style={styles.thumbPlaceholder} accessibilityElementsHidden>
                <Ionicons name="image-outline" size={22} color={ui.textSecondary} />
              </View>
            )}
          </View>
          <View style={styles.listingTextBlock}>
            <Text style={styles.listingTitle} numberOfLines={1}>
              {listingTitle}
            </Text>
            {previewLine ? (
              <Text style={styles.previewLine} numberOfLines={2}>
                {previewLine}
              </Text>
            ) : null}
            <Text style={styles.timeAgo} numberOfLines={1}>
              {timeAgo}
            </Text>
          </View>
        </View>

        {/* THIRD: logistics + inline “View offer” (full card remains tappable) */}
        <View style={styles.metaBlock}>
          <View style={styles.metaRowWithCta}>
            <Text style={styles.metaLine} numberOfLines={2}>
              {logisticsLine}
            </Text>
            <View style={styles.inlineCta} pointerEvents="none">
              <Text style={styles.inlineCtaLabel}>View offer</Text>
              <Ionicons name="chevron-forward" size={16} color={ui.primary} />
            </View>
          </View>
          {areaMeta.trim().length > 0 && areaMeta !== '—' ? (
            <Text style={styles.metaArea} numberOfLines={2}>
              {areaMeta}
            </Text>
          ) : null}
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: {
    marginBottom: marketplaceOfferCard.marginBottom,
  },
  card: {
    position: 'relative',
    overflow: 'visible',
  },
  pressDim: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.cardMarketplace,
    backgroundColor: marketplaceOfferCard.pressOverlay,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  topLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  avatar: {
    width: AV,
    height: AV,
    borderRadius: AV / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerTextCol: {
    flex: 1,
    minWidth: 0,
  },
  nameBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  ownerName: {
    fontSize: 16,
    fontWeight: '700',
    color: ui.textPrimary,
    flexShrink: 1,
  },
  bestValuePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: semantic.bestValueBadgeBg,
  },
  bestValuePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: semantic.bestValueBadgeText,
    letterSpacing: 0.2,
  },
  ratingLine: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: ui.textSecondary,
  },
  topRightPrice: {
    alignItems: 'flex-end',
    flexShrink: 0,
    maxWidth: '46%',
    paddingLeft: 4,
  },
  totalLabel: {
    ...marketplaceTypography.totalLabel,
    alignSelf: 'flex-end',
  },
  totalPrice: {
    ...marketplaceTypography.priceHero,
    textAlign: 'right',
  },
  priceSub: {
    ...marketplaceTypography.priceSub,
  },
  listingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 6,
  },
  thumbClip: {
    width: TH,
    height: TH,
    borderRadius: radius.thumbMarketplace,
    overflow: 'hidden',
    backgroundColor: ui.surfaceGrouped,
  },
  thumbPlaceholder: {
    width: TH,
    height: TH,
    borderRadius: radius.thumbMarketplace,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.surfaceGrouped,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  listingTextBlock: {
    flex: 1,
    minWidth: 0,
    paddingTop: 1,
  },
  listingTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: ui.primary,
  },
  previewLine: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '500',
    color: ui.textSecondary,
    lineHeight: 16,
    opacity: 0.86,
  },
  timeAgo: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: ui.textSecondary,
  },
  metaBlock: {
    paddingTop: 2,
    opacity: 0.82,
  },
  metaRowWithCta: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  metaLine: {
    ...marketplaceTypography.metaCompact,
    flex: 1,
    minWidth: 0,
  },
  metaArea: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '500',
    color: ui.textSecondary,
    lineHeight: 15,
  },
  inlineCta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 1,
    marginTop: 0,
    paddingLeft: 4,
  },
  inlineCtaLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.primary,
    letterSpacing: -0.15,
  },
});
