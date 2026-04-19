import React from 'react';
import { StyleSheet, Text, TextStyle } from 'react-native';

import { ui } from '@/constants/appUi';
import {
  formatHowDisplay,
  needsDeliveryFee,
} from '../lib/deliveryFormat';
import { formatDistanceFromYou } from '../lib/requestDistance';
import { formatDurationDisplay, type DurationType } from '../lib/durationFormat';
import { formatUsd, getNumericTotalPrice } from '../lib/money';

function dash(value: unknown): string {
  if (value == null) return '—';
  const s = String(value).trim();
  return s === '' ? '—' : s;
}

export type RequestMetaVariant = 'default' | 'card';

type Props = {
  req: {
    durationType?: DurationType | string | null | undefined;
    durationValue?: number | null | undefined;
    duration?: unknown;
    totalPrice?: unknown;
    budget?: unknown;
    deliveryFee?: unknown;
    how?: string | null;
    pickupRadiusMiles?: number | null;
    location?: string | null;
    timestamp?: number | null;
    requestLat?: unknown;
    requestLng?: unknown;
  };
  detailStyle?: TextStyle;
  /** Card lists: tighter hierarchy (secondary vs subtle lines). */
  variant?: RequestMetaVariant;
};

export function RequestMetaLines({ req, detailStyle, variant = 'default' }: Props) {
  const isCard = variant === 'card';
  const secondaryStyle = isCard
    ? styles.cardSecondary
    : detailStyle
      ? [styles.detail, detailStyle]
      : styles.detail;
  const subtleStyle = isCard ? styles.cardSubtle : secondaryStyle;
  const hintStyle = isCard ? styles.cardHint : styles.hint;
  const total = getNumericTotalPrice(req);
  const fee = req.deliveryFee;
  const feeNum =
    typeof fee === 'number' && Number.isFinite(fee)
      ? fee
      : fee != null && String(fee).trim() !== ''
        ? Number(String(fee).replace(/[^0-9.]/g, ''))
        : null;
  const feeDisplay =
    feeNum != null && Number.isFinite(feeNum) ? formatUsd(feeNum) : '—';

  return (
    <>
      <Text style={secondaryStyle}>
        Total for entire duration: {total != null ? formatUsd(total) : '—'}
      </Text>
      <Text style={secondaryStyle}>Duration: {formatDurationDisplay(req)}</Text>
      <Text style={secondaryStyle}>Delivery: {formatHowDisplay(req)}</Text>
      {needsDeliveryFee(req.how) && (
        <Text style={secondaryStyle}>Delivery fee you can pay: {feeDisplay}</Text>
      )}
      <Text style={subtleStyle}>Listed area: {dash(req.location)}</Text>
      <Text style={subtleStyle}>Distance from you: {formatDistanceFromYou(req)}</Text>
      <Text style={hintStyle}>Exact location will be shared after match.</Text>
    </>
  );
}

const styles = StyleSheet.create({
  detail: {
    fontSize: 15,
    color: ui.textPrimary,
    marginBottom: 4,
  },
  cardSecondary: {
    fontSize: 14,
    color: ui.textPrimary,
    marginBottom: 8,
    lineHeight: 20,
  },
  cardSubtle: {
    fontSize: 13,
    color: ui.textSecondary,
    marginBottom: 6,
    lineHeight: 18,
  },
  cardHint: {
    fontSize: 12,
    color: ui.textSecondary,
    marginTop: 4,
    marginBottom: 0,
    lineHeight: 17,
  },
  hint: {
    fontSize: 12,
    color: ui.textSecondary,
    fontStyle: 'italic',
    marginTop: 4,
    marginBottom: 2,
  },
});
