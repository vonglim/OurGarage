import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { cardChrome, ui } from '@/constants/appUi';
import { formatDurationDisplay } from '@/lib/durationFormat';
import { formatUsd, getNumericTotalPrice } from '@/lib/money';
import { getRequestCardUiStatus } from '@/lib/requestCardStatus';
import { formatMilesShort, milesFromViewerToRequest } from '@/lib/requestDistance';

export type ActivityRequestCardVariant = 'offers_waiting' | 'open' | 'in_progress' | 'archive';

/** Viewport width below this uses stacked mobile layout (SE / narrow phones included). */
const COMPACT_LAYOUT_MAX_WIDTH = 640;

type Req = {
  toolName?: string | null;
  matched?: boolean;
  acceptedPrice?: unknown;
  when?: string | null;
  timestamp?: number | null;
  how?: string | null;
  pickupRadiusMiles?: number | null;
  durationType?: string | null;
  durationValue?: number | null;
  duration?: unknown;
  totalPrice?: unknown;
  budget?: unknown;
  deliveryFee?: unknown;
  requestLat?: unknown;
  requestLng?: unknown;
};

function displayPrice(req: Req, matched: boolean): string {
  if (matched) return formatUsd(req.acceptedPrice);
  const rental = getNumericTotalPrice(req);
  if (rental == null) return '—';
  const delivery = req.how === 'delivery_only' ? Number(req.deliveryFee) : 0;
  const totalWithDelivery = rental + (Number.isFinite(delivery) ? delivery : 0);
  return formatUsd(totalWithDelivery);
}

function timeCompact(timeAgo: string): string {
  const t = timeAgo.trim();
  if (/^just now$/i.test(t)) return 'Just now';
  return t
    .replace(/\b(\d+)\s+minutes?\s+ago$/i, '$1 min ago')
    .replace(/\b(\d+)\s+hours?\s+ago$/i, '$1 hr ago')
    .replace(/\b1\s+day\s+ago$/i, '1d ago')
    .replace(/\b(\d+)\s+days?\s+ago$/i, '$1d ago');
}

function statusPresentation(
  cardKey: string,
  variant: ActivityRequestCardVariant
): { label: string; dot: string; fg: string; bg: string } {
  if (variant === 'archive') {
    if (cardKey === 'archived') return { label: 'Expired', dot: '#9CA3AF', fg: '#4B5563', bg: '#F3F4F6' };
    if (cardKey === 'completed') return { label: 'Completed', dot: '#9CA3AF', fg: '#4B5563', bg: '#F3F4F6' };
    return { label: 'Archived', dot: '#9CA3AF', fg: '#4B5563', bg: '#F3F4F6' };
  }
  if (variant === 'in_progress') {
    if (cardKey === 'active') return { label: 'Active Rental', dot: '#22C55E', fg: '#14532D', bg: '#ECFDF5' };
    if (cardKey === 'matched') return { label: 'Confirmed', dot: '#22C55E', fg: '#14532D', bg: '#ECFDF5' };
    if (cardKey === 'pending') return { label: 'Pending', dot: '#F59E0B', fg: '#92400E', bg: '#FFFBEB' };
    if (cardKey === 'open') return { label: 'Open', dot: '#60A5FA', fg: '#1E3A5F', bg: '#EFF6FF' };
    return { label: 'In progress', dot: '#22C55E', fg: '#14532D', bg: '#ECFDF5' };
  }
  switch (cardKey) {
    case 'pending':
      return { label: 'Pending', dot: '#F59E0B', fg: '#92400E', bg: '#FFFBEB' };
    case 'matched':
      return { label: 'Confirmed', dot: '#22C55E', fg: '#14532D', bg: '#ECFDF5' };
    case 'active':
      return { label: 'Active', dot: '#3B82F6', fg: '#1E40AF', bg: '#EFF6FF' };
    case 'archived':
      return { label: 'Expired', dot: '#9CA3AF', fg: '#374151', bg: '#F3F4F6' };
    case 'completed':
      return { label: 'Completed', dot: '#9CA3AF', fg: '#374151', bg: '#F3F4F6' };
    default:
      return { label: 'Open', dot: '#60A5FA', fg: '#1E3A5F', bg: '#EFF6FF' };
  }
}

type OfferBadgeProps = { count: number; compact?: boolean; fullWidth?: boolean };

export function ActivityRequestOfferBadge({ count, compact, fullWidth }: OfferBadgeProps) {
  const label = count === 1 ? '1 OFFER WAITING' : `${count} OFFERS WAITING`;
  return (
    <View
      style={[styles.offerBadge, fullWidth && styles.offerBadgeFullWidth]}
      accessibilityRole="text"
    >
      <Text
        style={[styles.offerBadgeText, compact && styles.offerBadgeTextCompact]}
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
      >
        🔥 {label}
      </Text>
    </View>
  );
}

type CardProps = {
  req: Req;
  matched: boolean;
  timeAgoText: string | null;
  variant: ActivityRequestCardVariant;
  offerCount: number;
  onPress: () => void;
  disabled?: boolean;
  /** When true, outer wrapper is a View (parent `RectButton` handles press). */
  nestedInSwipeable?: boolean;
};

const CTA_SIZE = 44;
const CTA_HIT = 44;

export function ActivityOwnerRequestCard({
  req,
  matched,
  timeAgoText,
  variant,
  offerCount,
  onPress,
  disabled,
  nestedInSwipeable,
}: CardProps) {
  const { width: windowWidth } = useWindowDimensions();
  const isCompact = windowWidth < COMPACT_LAYOUT_MAX_WIDTH;

  const cardUi = getRequestCardUiStatus(req);
  const status = statusPresentation(cardUi.key, variant);
  const title = req.toolName?.trim() || 'Equipment request';
  const duration = formatDurationDisplay(req);
  const price = displayPrice(req, matched);
  const priceLine = price === '—' ? price : price.startsWith('$') ? price : `$${price}`;
  const pickupRadius =
    typeof req.pickupRadiusMiles === 'number' && Number.isFinite(req.pickupRadiusMiles)
      ? Math.max(1, Math.round(req.pickupRadiusMiles))
      : null;
  const deliveryLine = req.how === 'delivery_only' ? 'Needs delivery' : 'Pickup / meetup';
  const distanceLine =
    pickupRadius != null ? `Within ${pickupRadius} miles` : formatMilesShort(milesFromViewerToRequest(req), '~ nearby');
  const timePart = timeAgoText != null && timeAgoText !== '' ? timeCompact(timeAgoText) : null;

  const leftAccent =
    variant === 'offers_waiting'
      ? styles.cardAccentOffers
      : variant === 'open'
        ? styles.cardAccentOpen
        : variant === 'in_progress'
          ? styles.cardAccentInProgress
          : styles.cardAccentArchive;
  const thumbBg =
    variant === 'offers_waiting'
      ? '#FEF3C7'
      : variant === 'open'
        ? '#DBEAFE'
        : variant === 'in_progress'
          ? '#DCFCE7'
          : '#E5E7EB';
  const thumbIcon =
    variant === 'archive'
      ? '#6B7280'
      : variant === 'offers_waiting'
        ? '#B45309'
        : variant === 'in_progress'
          ? '#15803D'
          : ui.primary;
  const ctaBg =
    variant === 'offers_waiting'
      ? 'rgba(254, 226, 226, 0.95)'
      : variant === 'open'
        ? 'rgba(219, 234, 254, 0.95)'
        : variant === 'in_progress'
          ? 'rgba(220, 252, 231, 0.95)'
          : '#F3F4F6';
  const ctaIcon =
    variant === 'offers_waiting'
      ? '#DC2626'
      : variant === 'open'
        ? ui.primary
        : variant === 'in_progress'
          ? '#166534'
          : '#6B7280';

  const showOfferBadge = variant === 'offers_waiting' && offerCount > 0 && !matched;

  const statusPillEl = (
    <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
      <View style={[styles.statusDot, { backgroundColor: status.dot }]} />
      <Text style={[styles.statusPillText, { color: status.fg }]} numberOfLines={1}>
        {status.label}
      </Text>
    </View>
  );

  const titleEl = (
    <Text
      style={[
        styles.title,
        variant === 'archive' && styles.titleArchive,
        isCompact && styles.titleCompact,
        !isCompact && styles.titleWide,
      ]}
      numberOfLines={2}
    >
      {title}
    </Text>
  );

  const priceEl = (
    <Text style={[styles.priceRow, variant === 'archive' && styles.metaArchive]} numberOfLines={1}>
      <Text style={[styles.priceEm, isCompact && styles.priceEmCompact]}>{priceLine}</Text>
      <Text style={[styles.durationPart, isCompact && styles.durationPartCompact]}> • {duration}</Text>
    </Text>
  );

  const metaEl = (
    <View style={[styles.metaRow, isCompact && styles.metaRowCompact]}>
      <View style={styles.metaItem}>
        <Ionicons
          name={req.how === 'delivery_only' ? 'car-outline' : 'hand-left-outline'}
          size={14}
          color={variant === 'archive' ? '#9CA3AF' : ui.textSecondary}
        />
        <Text style={[styles.metaText, variant === 'archive' && styles.metaArchive]} numberOfLines={1}>
          {deliveryLine}
        </Text>
      </View>
      <Text style={[styles.metaDot, variant === 'archive' && styles.metaArchive]}>·</Text>
      <View style={styles.metaItem}>
        <Ionicons name="location-outline" size={14} color={variant === 'archive' ? '#9CA3AF' : ui.textSecondary} />
        <Text style={[styles.metaText, variant === 'archive' && styles.metaArchive]} numberOfLines={1}>
          {distanceLine}
        </Text>
      </View>
      {timePart != null ? (
        <>
          <Text style={[styles.metaDot, variant === 'archive' && styles.metaArchive]}>·</Text>
          <Text style={[styles.metaText, variant === 'archive' && styles.metaArchive]} numberOfLines={1}>
            {timePart}
          </Text>
        </>
      ) : null}
    </View>
  );

  const thumbEl = (
    <View style={[styles.thumb, { backgroundColor: thumbBg }]}>
      <Ionicons name="construct" size={isCompact ? 24 : 26} color={thumbIcon} />
    </View>
  );

  const ctaEl = (
    <View
      style={[styles.ctaCircle, { backgroundColor: ctaBg }, isCompact && styles.ctaCircleCompact]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Ionicons name="chevron-forward" size={isCompact ? 20 : 22} color={ctaIcon} />
    </View>
  );

  const inner = isCompact ? (
    <View style={styles.cardInnerCompact}>
      {showOfferBadge ? (
        <View style={styles.compactOfferBanner}>
          <ActivityRequestOfferBadge count={offerCount} compact fullWidth />
        </View>
      ) : null}

      <View style={styles.compactMainRelative}>
        <View style={[styles.compactTextBlock, { paddingRight: CTA_HIT + 4 }]}>
          <View style={styles.compactThumbTitleRow}>
            {thumbEl}
            <View style={styles.compactTitleColumn}>
              {titleEl}
              <View style={styles.compactStatusWrap}>{statusPillEl}</View>
            </View>
          </View>
          <View style={styles.compactPriceWrap}>{priceEl}</View>
          {metaEl}
        </View>
        <View style={styles.compactCtaAnchor} pointerEvents="none">
          {ctaEl}
        </View>
      </View>
    </View>
  ) : (
    <View style={styles.cardInnerWide}>
      {thumbEl}
      <View style={styles.wideMainCol}>
        <View style={styles.wideTopRow}>
          <View style={styles.wideBadgeSlot}>
            {showOfferBadge ? <ActivityRequestOfferBadge count={offerCount} /> : null}
          </View>
          {statusPillEl}
        </View>
        {titleEl}
        {priceEl}
        {metaEl}
      </View>
      <View style={styles.wideCtaCol}>{ctaEl}</View>
    </View>
  );

  const shellStyle = [
    styles.cardWrap,
    leftAccent,
    variant === 'archive' && styles.cardArchive,
    disabled && { opacity: 0.55 },
  ];

  if (nestedInSwipeable) {
    return <View style={shellStyle}>{inner}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [...shellStyle, pressed && !disabled && styles.cardPressed]}
    >
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardWrap: {
    ...cardChrome,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: 'transparent',
    overflow: 'hidden',
  },
  cardAccentOffers: {
    borderLeftColor: '#FCA5A5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardAccentOpen: {
    borderLeftColor: '#93C5FD',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  cardAccentInProgress: {
    borderLeftColor: '#86EFAC',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 1,
  },
  cardAccentArchive: {
    borderLeftColor: '#D1D5DB',
    opacity: 0.92,
  },
  cardArchive: {
    backgroundColor: '#FAFAFA',
  },
  cardPressed: {
    opacity: 0.94,
  },

  /** ---- Mobile-first (compact) ---- */
  cardInnerCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  compactOfferBanner: {
    marginBottom: 12,
    alignSelf: 'stretch',
    maxWidth: '100%',
  },
  offerBadge: {
    alignSelf: 'flex-start',
    flexShrink: 0,
    flexGrow: 0,
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.25)',
  },
  offerBadgeFullWidth: {
    alignSelf: 'stretch',
  },
  offerBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B91C1C',
    letterSpacing: 0.15,
    flexShrink: 0,
  },
  offerBadgeTextCompact: {
    fontSize: 11,
    letterSpacing: 0.1,
  },
  compactMainRelative: {
    position: 'relative',
    alignSelf: 'stretch',
  },
  compactTextBlock: {
    minWidth: 0,
    flexShrink: 1,
  },
  compactThumbTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  compactTitleColumn: {
    flex: 1,
    minWidth: 0,
  },
  compactStatusWrap: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  compactPriceWrap: {
    marginTop: 12,
  },
  compactCtaAnchor: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: CTA_HIT,
    height: CTA_HIT,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /** ---- Tablet / desktop (wide) ---- */
  cardInnerWide: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: 14,
    paddingHorizontal: 12,
    gap: 12,
  },
  wideMainCol: {
    flex: 1,
    minWidth: 0,
  },
  wideTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  wideBadgeSlot: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
    flexShrink: 1,
    maxWidth: '72%',
  },
  wideCtaCol: {
    justifyContent: 'center',
    flexShrink: 0,
  },

  thumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
    flexShrink: 0,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    flexShrink: 0,
    flexGrow: 0,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '800',
    flexShrink: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: ui.textPrimary,
    lineHeight: 21,
  },
  titleCompact: {
    fontSize: 15,
    lineHeight: 20,
  },
  titleArchive: {
    color: '#6B7280',
  },
  titleWide: {
    marginTop: 4,
  },
  priceRow: {
    flexShrink: 1,
  },
  priceEm: {
    fontSize: 17,
    fontWeight: '800',
    color: ui.textPrimary,
    letterSpacing: -0.4,
  },
  priceEmCompact: {
    fontSize: 16,
  },
  durationPart: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.textSecondary,
  },
  durationPartCompact: {
    fontSize: 13,
  },
  metaArchive: {
    color: '#9CA3AF',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
  },
  metaRowCompact: {
    marginTop: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%',
    flexShrink: 1,
  },
  metaText: {
    fontSize: 12,
    fontWeight: '600',
    color: ui.textSecondary,
    flexShrink: 1,
  },
  metaDot: {
    fontSize: 12,
    color: ui.textMuted,
    fontWeight: '700',
    flexShrink: 0,
  },
  ctaCircle: {
    width: CTA_SIZE,
    height: CTA_SIZE,
    borderRadius: CTA_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
    flexShrink: 0,
  },
  ctaCircleCompact: {
    width: CTA_HIT,
    height: CTA_HIT,
    borderRadius: CTA_HIT / 2,
  },
});
