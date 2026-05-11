import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';
import { formatDurationDisplay } from '@/lib/durationFormat';
import { formatUsd, getNumericTotalPrice } from '@/lib/money';
import { getRequestCardUiStatus } from '@/lib/requestCardStatus';
import { formatMilesShort, milesFromViewerToRequest } from '@/lib/requestDistance';
import { splitRequestDisplayTitle } from '@/lib/splitRequestDisplayTitle';

export type ActivityRequestCardVariant = 'offers_waiting' | 'open' | 'in_progress' | 'archive';

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
    if (cardKey === 'active') return { label: 'Active rental', dot: '#22C55E', fg: '#14532D', bg: '#ECFDF5' };
    if (cardKey === 'matched') return { label: 'Confirmed', dot: '#22C55E', fg: '#14532D', bg: '#ECFDF5' };
    if (cardKey === 'pending') return { label: 'Pending', dot: '#F59E0B', fg: '#7C2D12', bg: '#FFFBEB' };
    if (cardKey === 'open') return { label: 'Open', dot: '#93C5FA', fg: '#1E3A8A', bg: '#F0F9FF' };
    return { label: 'In progress', dot: '#22C55E', fg: '#14532D', bg: '#ECFDF5' };
  }
  switch (cardKey) {
    case 'pending':
      return { label: 'Pending', dot: '#F59E0B', fg: '#7C2D12', bg: '#FFFBEB' };
    case 'matched':
      return { label: 'Confirmed', dot: '#22C55E', fg: '#14532D', bg: '#ECFDF5' };
    case 'active':
      return { label: 'Active', dot: '#60A5FA', fg: '#1E3A8A', bg: '#EFF6FF' };
    case 'archived':
      return { label: 'Expired', dot: '#9CA3AF', fg: '#4B5563', bg: '#F3F4F6' };
    case 'completed':
      return { label: 'Completed', dot: '#9CA3AF', fg: '#4B5563', bg: '#F3F4F6' };
    default:
      return { label: 'Open', dot: '#93C5FA', fg: '#1E3A8A', bg: '#F0F9FF' };
  }
}

type OfferBadgeProps = { count: number; compact?: boolean; fullWidth?: boolean };

/** Compact offer count hint (no emoji) — optional use outside the card. */
export function ActivityRequestOfferBadge({ count, compact, fullWidth }: OfferBadgeProps) {
  const label = count === 1 ? '1 offer waiting' : `${count} offers waiting`;
  return (
    <View
      style={[styles.offerHintChip, fullWidth && styles.offerHintChipFull]}
      accessibilityRole="text"
    >
      <Text style={[styles.offerHintChipText, compact && styles.offerHintChipTextCompact]} numberOfLines={1}>
        {label}
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
  const cardUi = getRequestCardUiStatus(req);
  const status = statusPresentation(cardUi.key, variant);
  const rawTitle = req.toolName?.trim() || 'Equipment request';
  const { primary: titlePrimary, context: titleContext } = splitRequestDisplayTitle(rawTitle);
  const duration = formatDurationDisplay(req);
  const price = displayPrice(req, matched);
  const priceLine = price === '—' ? price : price.startsWith('$') ? price : `$${price}`;
  const pickupRadius =
    typeof req.pickupRadiusMiles === 'number' && Number.isFinite(req.pickupRadiusMiles)
      ? Math.max(1, Math.round(req.pickupRadiusMiles))
      : null;
  const deliveryLine = req.how === 'delivery_only' ? 'Delivery' : 'Pickup';
  const distanceLine =
    pickupRadius != null ? `Within ${pickupRadius} mi` : formatMilesShort(milesFromViewerToRequest(req), '~ nearby');
  const timePart = timeAgoText != null && timeAgoText !== '' ? timeCompact(timeAgoText) : null;

  const showOfferHint = variant === 'offers_waiting' && offerCount > 0 && !matched;
  const showSubtitle = Boolean(titleContext?.trim());

  const statusPillEl = (
    <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
      <View style={[styles.statusDot, { backgroundColor: status.dot }]} />
      <Text style={[styles.statusPillText, { color: status.fg }]} numberOfLines={1}>
        {status.label}
      </Text>
    </View>
  );

  const metaArchive = variant === 'archive';

  const inner = (
    <View style={styles.cardInner}>
      <View style={styles.topRow}>
        <View style={styles.titleBlock}>
          <Text style={[styles.cardTitle, metaArchive && styles.cardTitleArchive]} numberOfLines={2}>
            {titlePrimary}
          </Text>
          {showSubtitle ? (
            <Text style={styles.cardSubtitle} numberOfLines={1}>
              {titleContext}
            </Text>
          ) : null}
          {showOfferHint ? (
            <Text style={styles.offerHint} accessibilityLabel={`${offerCount} offers awaiting your response`}>
              {offerCount === 1 ? '1 offer awaiting your response' : `${offerCount} offers awaiting your response`}
            </Text>
          ) : null}
          <View style={styles.pillRow}>{statusPillEl}</View>
        </View>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={metaArchive ? '#9CA3AF' : 'rgba(11, 31, 58, 0.56)'}
          style={styles.chevron}
        />
      </View>

      <View style={[styles.metaRow, metaArchive && styles.metaRowArchive]}>
        <Text style={[styles.metaStrong, metaArchive && styles.metaMuted]} numberOfLines={1}>
          {priceLine}
        </Text>
        <Text style={[styles.metaSep, metaArchive && styles.metaMuted]}>·</Text>
        <Text style={[styles.metaRest, metaArchive && styles.metaMuted]} numberOfLines={1}>
          {duration}
        </Text>
        <Text style={[styles.metaSep, metaArchive && styles.metaMuted]}>·</Text>
        <View style={styles.metaIconPair}>
          <Ionicons
            name={req.how === 'delivery_only' ? 'car-outline' : 'hand-left-outline'}
            size={12}
            color={metaArchive ? '#9CA3AF' : 'rgba(11, 31, 58, 0.52)'}
          />
          <Text style={[styles.metaRest, metaArchive && styles.metaMuted]} numberOfLines={1}>
            {deliveryLine}
          </Text>
        </View>
        <Text style={[styles.metaSep, metaArchive && styles.metaMuted]}>·</Text>
        <View style={styles.metaIconPair}>
          <Ionicons name="location-outline" size={12} color={metaArchive ? '#9CA3AF' : 'rgba(11, 31, 58, 0.52)'} />
          <Text style={[styles.metaRest, metaArchive && styles.metaMuted]} numberOfLines={1}>
            {distanceLine}
          </Text>
        </View>
        {timePart != null ? (
          <>
            <Text style={[styles.metaSep, metaArchive && styles.metaMuted]}>·</Text>
            <Text style={[styles.metaRest, metaArchive && styles.metaMuted]} numberOfLines={1}>
              {timePart}
            </Text>
          </>
        ) : null}
      </View>
    </View>
  );

  const shellStyle = [styles.cardWrap, metaArchive && styles.cardWrapArchive, disabled && { opacity: 0.55 }];

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

const cardShadow = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  android: { elevation: 2 },
  default: {},
});

const styles = StyleSheet.create({
  cardWrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(11, 31, 58, 0.14)',
    marginBottom: 8,
    overflow: 'visible',
    ...cardShadow,
  },
  cardWrapArchive: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(11, 31, 58, 0.14)',
    ...cardShadow,
  },
  cardPressed: {
    opacity: 0.94,
    backgroundColor: ui.surfaceInput,
  },
  cardInner: {
    paddingTop: 9,
    paddingBottom: 9,
    paddingLeft: 14,
    paddingRight: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    paddingRight: 2,
  },
  chevron: {
    flexShrink: 0,
    alignSelf: 'center',
    opacity: 1,
  },
  cardTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: ui.textPrimary,
    lineHeight: 25,
    letterSpacing: -0.2,
  },
  cardTitleArchive: {
    color: '#6B7280',
  },
  cardSubtitle: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '500',
    color: ui.textSecondary,
    lineHeight: 18,
    opacity: 0.95,
  },
  offerHint: {
    marginTop: 5,
    fontSize: 12,
    fontWeight: '600',
    color: ui.textSecondary,
    opacity: 0.88,
  },
  offerHintChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(254, 242, 242, 0.85)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(220, 38, 38, 0.12)',
  },
  offerHintChipFull: {
    alignSelf: 'stretch',
  },
  offerHintChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9B1C1C',
    letterSpacing: 0.12,
  },
  offerHintChipTextCompact: {
    fontSize: 11,
  },
  pillRow: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(11, 31, 58, 0.10)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '800',
    flexShrink: 0,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    rowGap: 3,
  },
  metaRowArchive: {
    opacity: 0.95,
  },
  metaStrong: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(17, 24, 39, 0.96)',
    flexShrink: 0,
  },
  metaSep: {
    fontSize: 11,
    color: 'rgba(55, 65, 81, 0.62)',
    fontWeight: '600',
    flexShrink: 0,
  },
  metaRest: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(55, 65, 81, 0.94)',
    flexShrink: 1,
  },
  metaMuted: {
    color: '#9CA3AF',
  },
  metaIconPair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 1,
    minWidth: 0,
  },
});
