import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatHowDisplay } from '../lib/deliveryFormat';
import {
  formatDurationDisplay,
  type DurationType,
} from '../lib/durationFormat';
import { getRequestCardUiStatus } from '../lib/requestCardStatus';
import { milesFromViewerToRequest } from '../lib/requestDistance';
import { formatUsd, getNumericTotalPrice } from '../lib/money';
import { ui } from '@/constants/appUi';

const CARD_BORDER = '#E5E5EA';
const CARD_PADDING = 14;
const GAP_AFTER_TITLE = 4;
const GAP_PRICE_TO_DELIVERY = 8;
/** Space above bottom row (distance/time [+ Offer]). */
const BOTTOM_ROW_MARGIN_TOP = 9;

export const requestListCardSurface = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: CARD_PADDING,
    marginBottom: 0,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
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
};

function displayPrice(req: Req, matched: boolean): string {
  if (matched) return formatUsd(req.acceptedPrice);
  const total = getNumericTotalPrice(req);
  return total != null ? formatUsd(total) : '—';
}

function priceForDisplay(req: Req, matched: boolean): string {
  const s = displayPrice(req, matched);
  if (s === '—') return s;
  return s.startsWith('$') ? s : `$${s}`;
}

function distanceCompact(req: Req): string {
  const mi = milesFromViewerToRequest(req);
  if (mi == null) return '~ nearby';
  const rounded = Math.round(mi * 10) / 10;
  return `${rounded.toFixed(1)} mi`;
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
}: Props) {
  const status = getRequestCardUiStatus(req);
  const title = req.toolName?.trim() || 'No name';
  const duration = formatDurationDisplay(req);
  const price = priceForDisplay(req, matched);

  const dist = distanceCompact(req);
  const timePart =
    timeAgoText != null && timeAgoText !== '' ? timeCompact(timeAgoText) : null;
  const leftFooter = timePart != null ? `${dist} • ${timePart}` : dist;

  return (
    <View style={styles.root}>
      <View style={styles.contentColumn}>
        <View style={styles.topRow}>
          <Text style={styles.toolName} numberOfLines={2}>
            {title}
          </Text>
          <View style={styles.statusWrap}>
            <View style={[styles.statusDot, { backgroundColor: status.dotColor }]} />
            <Text style={styles.statusLabel}>{status.label}</Text>
          </View>
        </View>

        <Text style={styles.priceDurationRow} numberOfLines={2}>
          <Text style={styles.priceEmphasis}>{price}</Text>
          <Text style={styles.durationInline}> • {duration}</Text>
        </Text>

        <Text style={styles.deliveryLine} numberOfLines={2}>
          {formatHowDisplay(req)}
        </Text>

        {offerAction != null ? (
          <View style={styles.bottomRow}>
            <Text style={styles.footerMetaLeft} numberOfLines={2}>
              {leftFooter}
            </Text>
            <Pressable
              disabled={offerAction.disabled}
              onPress={offerAction.onPress}
              style={({ pressed }) => [
                styles.offerPill,
                offerAction.disabled && styles.offerPillDisabled,
                pressed && !offerAction.disabled && styles.offerPillPressed,
              ]}
            >
              <Text
                style={[
                  styles.offerPillText,
                  offerAction.disabled && styles.offerPillTextDisabled,
                ]}
              >
                Offer Tool
              </Text>
            </Pressable>
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
  contentColumn: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: GAP_AFTER_TITLE,
  },
  toolName: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#111111',
    lineHeight: 22,
    paddingRight: 4,
    textAlign: 'left',
  },
  statusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
    maxWidth: '46%',
    paddingTop: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#555555',
    letterSpacing: 0.15,
  },
  priceDurationRow: {
    marginTop: GAP_AFTER_TITLE,
    textAlign: 'left',
  },
  priceEmphasis: {
    fontSize: 24,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: -0.45,
  },
  durationInline: {
    fontSize: 14,
    fontWeight: '700',
    color: '#454B58',
  },
  deliveryLine: {
    marginTop: GAP_PRICE_TO_DELIVERY,
    fontSize: 13,
    fontWeight: '400',
    color: '#6B7280',
    lineHeight: 18,
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
    color: '#8E8E93',
    textAlign: 'left',
    marginRight: 4,
    minWidth: 0,
  },
  footerLine: {
    marginTop: BOTTOM_ROW_MARGIN_TOP,
    fontSize: 11,
    fontWeight: '400',
    color: '#8E8E93',
    textAlign: 'left',
  },
  offerPill: {
    flexShrink: 0,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: ui.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  offerPillDisabled: {
    backgroundColor: '#CCCCCC',
  },
  offerPillPressed: {
    opacity: ui.pressOpacity,
  },
  offerPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  offerPillTextDisabled: {
    color: '#666666',
  },
});
