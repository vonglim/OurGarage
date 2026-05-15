import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';
import { formatUsd } from '@/lib/money';
import type { NegotiationDeliveryMethod } from '@/lib/negotiationDelivery';
import {
  listingOfferOwnerCanRespond,
  listingOfferRemainingDeclinesBeforeLock,
  listingOfferRemainingOwnerCounters,
} from '@/lib/listingOfferNegotiationUi';
import type { ListingOfferActivityRow } from '@/store/listingOffersActivityStore';

function formatStatusBadge(row: ListingOfferActivityRow): string {
  if (row.negotiationLocked || row.status === 'declined' || row.status === 'closed') {
    return 'Closed';
  }
  if (row.status === 'accepted' || row.status === 'pending_confirmation') return 'Accepted';
  if (row.status === 'pending') {
    const k = row.lastNegotiationEventKind ?? '';
    if (k === 'proposal_declined') return 'Offer declined';
    if (k === 'poster_counter') return 'Counter sent';
    if (row.posterCounterCount > 0) return 'In negotiation';
  }
  return 'Pending offer';
}

function deliverySummary(method: NegotiationDeliveryMethod | null, fee: number | null): string {
  if (method === 'owner_delivery') {
    return fee != null && fee > 0 ? `Delivery · up to ${formatUsd(fee)}` : 'Delivery';
  }
  if (method === 'pickup') return 'Pickup';
  return '—';
}

type Props = {
  row: ListingOfferActivityRow;
  role: 'owner' | 'renter';
  timeAgo: string;
  onPress: () => void;
  onAccept?: () => void;
  onDecline?: () => void;
  onCounter?: (offerId: string) => void;
  busy?: boolean;
};

export function ActivityListingOfferCard({
  row,
  role,
  timeAgo,
  onPress,
  onAccept,
  onDecline,
  onCounter,
  busy,
}: Props) {
  const title = row.snapshot?.title ?? 'Listing';
  const hero = row.snapshot?.hero_image_url?.trim();
  const ownerCanAct =
    role === 'owner' &&
    listingOfferOwnerCanRespond(row) &&
    onAccept &&
    onDecline &&
    onCounter;
  const countersLeft = listingOfferRemainingOwnerCounters(row);
  const declinesLeft = listingOfferRemainingDeclinesBeforeLock(row);

  return (
    <View style={styles.card}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.cardTap, pressed && styles.cardPressed]}>
        <View style={styles.topRow}>
          {hero ? (
            <Image source={{ uri: hero }} style={styles.thumb} contentFit="cover" accessibilityLabel="Listing" />
          ) : (
            <View style={[styles.thumb, styles.thumbPh]} />
          )}
          <View style={styles.topText}>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {role === 'owner' ? row.renterDisplayName : 'Your offer'} · {timeAgo}
            </Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{formatStatusBadge(row)}</Text>
          </View>
        </View>
        <Text style={styles.amount}>{formatUsd(row.currentPrice)}</Text>
        <Text style={styles.sub}>
          {deliverySummary(row.negotiationDeliveryMethod, row.negotiationDeliveryFee)}
        </Text>
      </Pressable>
      {ownerCanAct ? (
        <View style={styles.actions}>
          <Pressable
            onPress={() => onAccept?.()}
            disabled={busy}
            style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.9 }, busy && { opacity: 0.5 }]}
          >
            <Text style={styles.btnPrimaryText}>Accept</Text>
          </Pressable>
          <View style={styles.secondaryRow}>
            <Pressable
              onPress={() => onCounter?.(row.id)}
              disabled={busy || countersLeft <= 0}
              style={({ pressed }) => [
                styles.btnSecondary,
                pressed && { opacity: 0.9 },
                (busy || countersLeft <= 0) && { opacity: 0.45 },
              ]}
            >
              <Text style={styles.btnSecondaryText}>Counter</Text>
            </Pressable>
            <Pressable
              onPress={() => onDecline?.()}
              disabled={busy}
              style={({ pressed }) => [styles.btnDecline, pressed && { opacity: 0.85 }, busy && { opacity: 0.5 }]}
            >
              <Text style={styles.btnDeclineText}>Decline</Text>
            </Pressable>
          </View>
          <Text style={styles.negotiationMeta}>
            {countersLeft} counter{countersLeft === 1 ? '' : 's'} left · after{' '}
            {declinesLeft === 1 ? '1 more decline' : `${declinesLeft} more declines`} this thread closes
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: ui.radiusInput,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    backgroundColor: ui.background,
    marginBottom: ui.spaceSm,
  },
  cardTap: {
    padding: ui.spaceMd,
  },
  cardPressed: {
    opacity: 0.96,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: ui.surfaceNeutral,
  },
  thumbPh: {},
  topText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: ui.textPrimary,
  },
  meta: {
    marginTop: 4,
    fontSize: 13,
    color: ui.textSecondary,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: ui.surfaceTintPrimary,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.primary,
  },
  amount: {
    marginTop: 10,
    fontSize: 20,
    fontWeight: '800',
    color: ui.textPrimary,
  },
  sub: {
    marginTop: 4,
    fontSize: 14,
    color: ui.textSecondary,
  },
  actions: {
    paddingHorizontal: ui.spaceMd,
    paddingBottom: ui.spaceMd,
    gap: 10,
  },
  secondaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  negotiationMeta: {
    fontSize: 12,
    color: ui.textMuted,
    lineHeight: 16,
  },
  btnPrimary: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: ui.radiusButton,
    backgroundColor: ui.primary,
    alignItems: 'center',
  },
  btnPrimaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: ui.primaryOn,
  },
  btnSecondary: {
    flex: 1,
    minWidth: 120,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: ui.radiusButton,
    borderWidth: 2,
    borderColor: ui.primary,
    backgroundColor: ui.background,
    alignItems: 'center',
  },
  btnSecondaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.primary,
  },
  btnDecline: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  btnDeclineText: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.textMuted,
  },
});
