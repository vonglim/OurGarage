import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from '@/components/Pressable';
import { getRequestOwnerId } from '@/lib/requestOwnership';
import { getPublicProfileForView } from '@/lib/publicProfiles';
import { parseProfileAvatar } from '@/lib/profileAvatar';
import { getPresetById } from '@/lib/userAvatarPresets';
import {
  formatDurationDisplay,
  type DurationType,
} from '@/lib/durationFormat';
import { getRequestCardUiStatus } from '@/lib/requestCardStatus';
import { formatMilesShort, milesFromViewerToRequest } from '@/lib/requestDistance';
import { formatUsd, getNumericTotalPrice } from '@/lib/money';
import { cardChrome, ui } from '@/constants/appUi';
import { UserActivityDot } from './UserActivityDot';

/** Placeholder poster avatar (until backend provides URLs). */
const POSTER_AVATAR_SIZE = 32;
const GAP_AFTER_TITLE = 2;
const GAP_USER_TO_TITLE = 4;
const GAP_PRICE_TO_DELIVERY = 5;
/** Space above bottom row (distance/time [+ Offer]). */
const BOTTOM_ROW_MARGIN_TOP = 6;
/** Reserve space so poster name / title don’t run under the absolutely positioned status badge. */
const STATUS_BADGE_SIDE_INSET = 14;
const STATUS_BADGE_CLEARANCE = 88;

export const requestListCardSurface = StyleSheet.create({
  card: {
    position: 'relative',
    ...cardChrome,
    marginBottom: 0,
  },
});

type Req = {
  toolName?: string | null;
  matched?: boolean;
  acceptedPrice?: unknown;
  when?: string | null;
  timestamp?: number | null;
  how?: string | null;
  pickupRadiusMiles?: number | null;
  durationType?: DurationType | string | null | undefined;
  durationValue?: number | null;
  duration?: unknown;
  totalPrice?: unknown;
  budget?: unknown;
  deliveryFee?: unknown;
  location?: string | null;
  requestLat?: unknown;
  requestLng?: unknown;
};

export type RequestCardOfferAction = {
  disabled: boolean;
  onPress: () => void;
};

type Props = {
  req: Req;
  matched: boolean;
  timeAgoText: string | null;
  /** When set (Browse), bottom row is distance/time + Offer pill. */
  offerAction?: RequestCardOfferAction | null;
  /**
   * When true, do not render inner `Pressable`s (use `View` for the poster row / offer pill).
   * Use when this component is already inside a parent `Pressable` (e.g. `CardPressable`) so
   * web does not get nested button elements.
   */
  insideParentPressable?: boolean;
};

function displayPrice(req: Req, matched: boolean): string {
  if (matched) return formatUsd(req.acceptedPrice);
  const rental = getNumericTotalPrice(req);
  if (rental == null) return '—';
  const delivery =
    req.how === 'delivery_only' ? Number(req.deliveryFee) : 0;
  const totalWithDelivery = rental + (Number.isFinite(delivery) ? delivery : 0);
  return formatUsd(totalWithDelivery);
}

function priceForDisplay(req: Req, matched: boolean): string {
  const s = displayPrice(req, matched);
  if (s === '—') return s;
  return s.startsWith('$') ? s : `$${s}`;
}

function distanceCompact(req: Req): string {
  const mi = milesFromViewerToRequest(req);
  return formatMilesShort(mi, '~ nearby');
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

export function RequestListCardInner({
  req,
  matched,
  timeAgoText,
  offerAction,
  insideParentPressable = false,
}: Props) {
  const router = useRouter();
  const status = getRequestCardUiStatus(req);
  const title = req.toolName?.trim() || 'No name';
  const duration = formatDurationDisplay(req);
  const price = priceForDisplay(req, matched);
  const pickupRadius =
    typeof req.pickupRadiusMiles === 'number' && Number.isFinite(req.pickupRadiusMiles)
      ? Math.max(1, Math.round(req.pickupRadiusMiles))
      : null;
  const requestMethod = req.how === 'delivery_only' ? 'Delivered' : 'Picked up';
  const totalWithMethodLine =
    pickupRadius != null
      ? `${requestMethod} · within ${pickupRadius} miles`
      : `${requestMethod}`;
  const deliveryNeedLine = req.how === 'delivery_only' ? 'Needs delivery' : 'Pickup / meetup';

  const dist = distanceCompact(req);
  const timePart =
    timeAgoText != null && timeAgoText !== '' ? timeCompact(timeAgoText) : null;
  const leftFooter = timePart != null ? `${dist} • ${timePart}` : dist;

  const posterId = getRequestOwnerId(req as Record<string, unknown>) ?? '';
  const poster = getPublicProfileForView(posterId);
  const posterParsed = parseProfileAvatar(poster.avatar);
  const posterPreset =
    posterParsed.kind === 'preset' ? getPresetById(posterParsed.id) : null;
  const posterAvatarBg = posterPreset?.color ?? ui.borderLight;

  const posterRow = (
    <>
      <View style={[styles.posterAvatar, { backgroundColor: posterAvatarBg }]}>
        <Ionicons
          name={(posterPreset?.icon ?? 'person') as React.ComponentProps<typeof Ionicons>['name']}
          size={18}
          color={ui.primaryOn}
        />
      </View>
      <View style={styles.posterMeta}>
        <View style={styles.posterNameRow}>
          <UserActivityDot lastActive={poster.lastActive} />
          <Text style={styles.posterName} numberOfLines={1}>
            {poster.name}
          </Text>
        </View>
        <Text style={styles.posterRating}>⭐ {poster.ratingNumber.toFixed(1)}</Text>
      </View>
    </>
  );

  return (
    <View style={styles.root}>
      <View style={styles.statusBadge}>
        <View style={styles.statusWrap}>
          <View style={[styles.statusDot, { backgroundColor: status.dotColor }]} />
          <Text style={styles.statusLabel}>{status.label}</Text>
        </View>
      </View>

      <View style={styles.contentColumn}>
        {insideParentPressable ? (
          <View style={styles.userRow}>{posterRow}</View>
        ) : (
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/(tabs)/profile',
                params: { viewUserId: posterId },
              })
            }
            style={({ pressed }) => [styles.userRow, pressed && styles.userRowPressed]}
            accessibilityRole="button"
            accessibilityLabel={`${poster.name}, open profile`}
          >
            {posterRow}
          </Pressable>
        )}

        <View style={styles.topRow}>
          <Text style={styles.toolName} numberOfLines={2}>
            {title}
          </Text>
        </View>

        <Text style={styles.priceDurationRow} numberOfLines={2}>
          <Text style={styles.priceEmphasis}>{price}</Text>
          <Text style={styles.durationInline}> • {duration}</Text>
        </Text>

        <Text style={styles.deliveryLine} numberOfLines={2}>
          {deliveryNeedLine}
        </Text>
        <Text style={styles.totalModeLine} numberOfLines={2}>
          {totalWithMethodLine}
        </Text>

        {offerAction != null ? (
          <View style={styles.bottomRow}>
            <Text style={styles.footerMetaLeft} numberOfLines={2}>
              {leftFooter}
            </Text>
            {insideParentPressable ? (
              <View
                style={[
                  styles.offerActionPill,
                  offerAction.disabled && styles.offerActionPillDisabled,
                ]}
              >
                <Text
                  style={[
                    styles.offerActionText,
                    offerAction.disabled && styles.offerActionTextDisabled,
                  ]}
                >
                  $ Make an offer
                </Text>
              </View>
            ) : (
              <Pressable
                pressOpacityFeedback={false}
                haptic
                disabled={offerAction.disabled}
                onPress={offerAction.onPress}
                style={({ pressed }) => [
                  styles.offerActionPill,
                  offerAction.disabled && styles.offerActionPillDisabled,
                  pressed && !offerAction.disabled && styles.offerActionPillPressed,
                ]}
              >
                <Text
                  style={[
                    styles.offerActionText,
                    offerAction.disabled && styles.offerActionTextDisabled,
                  ]}
                >
                  $ Make an offer
                </Text>
              </Pressable>
            )}
          </View>
        ) : (
          <Text style={styles.footerLine} numberOfLines={2}>
            {leftFooter}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'stretch',
  },
  statusBadge: {
    position: 'absolute',
    top: STATUS_BADGE_SIDE_INSET,
    right: STATUS_BADGE_SIDE_INSET,
    zIndex: 1,
    maxWidth: '55%',
  },
  contentColumn: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: GAP_USER_TO_TITLE,
    alignSelf: 'stretch',
    paddingRight: STATUS_BADGE_CLEARANCE,
  },
  userRowPressed: {
    opacity: 0.88,
  },
  posterAvatar: {
    width: POSTER_AVATAR_SIZE,
    height: POSTER_AVATAR_SIZE,
    borderRadius: POSTER_AVATAR_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  posterMeta: {
    flex: 1,
    marginLeft: 10,
    minWidth: 0,
  },
  posterNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
    minWidth: 0,
  },
  posterName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: ui.textPrimary,
    minWidth: 0,
  },
  posterRating: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.textPrimary,
    letterSpacing: 0.2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: GAP_AFTER_TITLE,
  },
  toolName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: ui.textPrimary,
    lineHeight: 21,
    textAlign: 'left',
  },
  statusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: ui.textSecondary,
    letterSpacing: 0.15,
  },
  priceDurationRow: {
    marginTop: GAP_AFTER_TITLE,
    textAlign: 'left',
  },
  priceEmphasis: {
    fontSize: ui.fontPriceLarge + 3,
    fontWeight: '700',
    color: ui.textPrimary,
    letterSpacing: -0.45,
  },
  durationInline: {
    fontSize: 13,
    fontWeight: '600',
    color: ui.textSecondary,
  },
  deliveryLine: {
    marginTop: GAP_PRICE_TO_DELIVERY,
    fontSize: 12,
    fontWeight: '600',
    color: ui.textSecondary,
    lineHeight: 16,
    textAlign: 'left',
  },
  totalModeLine: {
    marginTop: 0,
    fontSize: 12,
    fontWeight: '500',
    color: ui.textPrimary,
    lineHeight: 16,
    textAlign: 'left',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: BOTTOM_ROW_MARGIN_TOP,
    gap: 10,
  },
  footerMetaLeft: {
    flex: 1,
    fontSize: 11,
    fontWeight: '400',
    color: ui.textSecondary,
    textAlign: 'left',
    marginRight: 2,
    minWidth: 0,
  },
  footerLine: {
    marginTop: BOTTOM_ROW_MARGIN_TOP,
    fontSize: 11,
    fontWeight: '400',
    color: ui.textSecondary,
    textAlign: 'left',
  },
  offerActionPill: {
    flexShrink: 0,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: ui.radiusInput,
    backgroundColor: ui.surfaceTintPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,122,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  offerActionPillDisabled: {
    backgroundColor: ui.surfaceNeutral,
    borderColor: ui.border,
  },
  offerActionPillPressed: {
    backgroundColor: '#E6F1FF',
  },
  offerActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.primary,
  },
  offerActionTextDisabled: {
    color: ui.textSecondary,
  },
});
