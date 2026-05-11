/**
 * Renby marketplace / card design tokens.
 * Foundation for compare offers, browse, rental cards, and search.
 */
import { Platform } from 'react-native';

import { ui } from '@/constants/appUi';

/** Spacing scale (4px base). */
export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 32,
} as const;

/** Corner radii. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  cardMarketplace: 16,
  thumbMarketplace: 16,
  pill: 999,
  iconTile: 10,
} as const;

/** Compare list — reserved height for future sort / filter / chip row. */
export const compareListToolbarMinHeight = 40;

/** Marketplace offer card (compare) — compact scan density. */
export const marketplaceOfferCard = {
  paddingH: space[3],
  paddingV: space[2],
  marginBottom: space[3],
  radius: radius.cardMarketplace,
  avatar: 40,
  thumb: 88,
  dividerOpacity: 0.22,
  pressScale: 0.98,
  pressAnimMs: 120,
  pressOverlay: 'rgba(11, 31, 58, 0.055)',
} as const;

/**
 * Elevation + border per compare card variant.
 * `best` = subtly highlighted, not a different “species” of card.
 */
export const marketplaceCompareElevation = {
  neutral: {
    shadowColor: '#0B1F3A' as const,
    shadowOffset: { width: 0, height: 3 } as const,
    shadowOpacity: 0.075,
    shadowRadius: 12,
    elevation: 3,
    borderColor: 'rgba(11, 31, 58, 0.1)',
    borderWidth: 1,
    pressShadowOpacityPressed: 0.035,
  },
  best: {
    shadowColor: '#14532D' as const,
    shadowOffset: { width: 0, height: 5 } as const,
    shadowOpacity: 0.13,
    shadowRadius: 16,
    elevation: 5,
    borderColor: 'rgba(22, 163, 74, 0.4)',
    borderWidth: 1,
    pressShadowOpacityPressed: 0.055,
    /** Slightly warmer surface so best reads as “chosen,” not a different card type. */
    cardSurfaceTint: '#F4FAF7' as const,
  },
} as const;

export type MarketplaceCompareCardVariant = keyof typeof marketplaceCompareElevation;

export const marketplaceTypography = {
  totalLabel: {
    fontSize: 9,
    fontWeight: '800' as const,
    letterSpacing: 1.05,
    textTransform: 'uppercase' as const,
    color: ui.textSecondary,
    marginBottom: 1,
  },
  /** Top-right anchor in lender row — strong but not full-width invoice block. */
  priceHero: {
    fontSize: 22,
    fontWeight: '800' as const,
    color: ui.primary,
    letterSpacing: -0.42,
    lineHeight: 26,
  },
  priceSub: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600' as const,
    color: ui.textSecondary,
    lineHeight: 14,
    textAlign: 'right' as const,
  },
  metaCompact: {
    fontSize: 11,
    fontWeight: '500' as const,
    color: ui.textSecondary,
    lineHeight: 15,
  },
} as const;

export const semantic = {
  bestValueBadgeBg: '#D1F4DD',
  bestValueBadgeText: '#0F3D22',
} as const;

export function marketplaceCardPlatformShadow(variant: MarketplaceCompareCardVariant) {
  const v = marketplaceCompareElevation[variant];
  if (Platform.OS === 'android') {
    return {
      shadowColor: v.shadowColor,
      shadowOffset: v.shadowOffset,
      shadowOpacity: v.shadowOpacity,
      shadowRadius: v.shadowRadius,
      elevation: v.elevation,
      overflow: 'visible' as const,
    };
  }
  return {
    shadowColor: v.shadowColor,
    shadowOffset: v.shadowOffset,
    shadowRadius: v.shadowRadius,
  };
}
