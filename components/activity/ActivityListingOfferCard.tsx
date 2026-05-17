import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  BookingDetailRow,
  ExpandableBookingCardShell,
  ProtectionBadge,
} from '@/components/activity/ExpandableBookingCardShell';
import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';
import { formatIsoDateMedium } from '@/lib/listingAvailabilityDates';
import {
  listingOfferOwnerCanRespond,
  listingOfferRemainingDeclinesBeforeLock,
  listingOfferRemainingOwnerCounters,
} from '@/lib/listingOfferNegotiationUi';
import { formatUsd } from '@/lib/money';
import type { NegotiationDeliveryMethod } from '@/lib/negotiationDelivery';
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

function dateRangeLabel(row: ListingOfferActivityRow): string {
  const s = row.rentalStartDate;
  const e = row.rentalEndDate;
  if (s && e) return `${formatIsoDateMedium(s)} – ${formatIsoDateMedium(e)}`;
  if (s) return formatIsoDateMedium(s);
  return 'Dates in offer detail';
}

type Props = {
  row: ListingOfferActivityRow;
  role: 'owner' | 'renter';
  timeAgo: string;
  onPress: () => void;
  onAccept?: () => void;
  onDecline?: () => void;
  onCounter?: (offerId: string) => void;
  onMessage?: () => void;
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
  onMessage,
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
  const replacement = row.replacementValue ?? row.snapshot?.replacement_value ?? null;
  const earningsEst = Number.isFinite(row.currentPrice) ? formatUsd(row.currentPrice * 0.85) : '—';

  return (
    <ExpandableBookingCardShell
      expandedContent={
        <>
          <BookingDetailRow label="Area" value={row.snapshot?.service_area?.trim() || '—'} />
          <BookingDetailRow label="Item" value={row.toolDescription?.trim() || '—'} />
          <BookingDetailRow
            label="Delivery budget"
            value={
              row.negotiationDeliveryMethod === 'owner_delivery' && row.negotiationDeliveryFee != null
                ? formatUsd(row.negotiationDeliveryFee)
                : '—'
            }
          />
          <BookingDetailRow
            label="Protection / replacement"
            value={replacement != null && Number.isFinite(replacement) ? formatUsd(replacement) : '—'}
          />
          <BookingDetailRow label="Handoff" value={row.snapshot?.handoff_summary?.trim() || '—'} />
          <BookingDetailRow label="Owner earnings (est.)" value={`~${earningsEst} after fees`} />
          {ownerCanAct ? (
            <Text style={styles.negotiationMeta}>
              {countersLeft} counter{countersLeft === 1 ? '' : 's'} left · after{' '}
              {declinesLeft === 1 ? '1 more decline' : `${declinesLeft} more declines`} this thread closes
            </Text>
          ) : null}
        </>
      }
    >
      <Pressable onPress={onPress} style={({ pressed }) => [styles.body, pressed && styles.bodyPressed]}>
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
              {role === 'owner' ? row.renterDisplayName : 'Your offer'}
              {row.renterRating > 0 ? ` · ★ ${row.renterRating.toFixed(1)}` : ''} · {timeAgo}
            </Text>
            <Text style={styles.dates}>{dateRangeLabel(row)}</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{formatStatusBadge(row)}</Text>
          </View>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.amount}>{formatUsd(row.currentPrice)}</Text>
          <Text style={styles.sub}>{deliverySummary(row.negotiationDeliveryMethod, row.negotiationDeliveryFee)}</Text>
          {replacement != null && replacement > 0 ? <ProtectionBadge /> : null}
        </View>
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
          <Pressable
            onPress={() => onMessage?.()}
            disabled={busy}
            style={({ pressed }) => [styles.btnMessage, pressed && { opacity: 0.9 }, busy && { opacity: 0.5 }]}
          >
            <Text style={styles.btnMessageText}>Message</Text>
          </Pressable>
          <Pressable
            onPress={() => onDecline?.()}
            disabled={busy}
            style={({ pressed }) => [styles.btnDecline, pressed && { opacity: 0.85 }, busy && { opacity: 0.5 }]}
          >
            <Text style={styles.btnDeclineText}>Decline</Text>
          </Pressable>
          <Pressable
            onPress={() => onCounter?.(row.id)}
            disabled={busy || countersLeft <= 0}
            style={({ pressed }) => [
              styles.btnCounter,
              pressed && { opacity: 0.9 },
              (busy || countersLeft <= 0) && { opacity: 0.45 },
            ]}
          >
            <Text style={styles.btnCounterText}>Counter</Text>
          </Pressable>
        </View>
      ) : null}
    </ExpandableBookingCardShell>
  );
}

const styles = StyleSheet.create({
  body: { padding: 12 },
  bodyPressed: { opacity: 0.96 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  thumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: ui.surfaceNeutral },
  thumbPh: {},
  topText: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontWeight: '700', color: ui.textPrimary },
  meta: { marginTop: 2, fontSize: 13, color: ui.textSecondary },
  dates: { marginTop: 2, fontSize: 12, fontWeight: '600', color: ui.textPrimary },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: ui.surfaceTintPrimary,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: ui.primary },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10 },
  amount: { fontSize: 18, fontWeight: '800', color: ui.textPrimary },
  sub: { fontSize: 13, color: ui.textSecondary },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  btnPrimary: {
    flex: 1,
    minWidth: 88,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: ui.primary,
    alignItems: 'center',
  },
  btnPrimaryText: { fontSize: 14, fontWeight: '700', color: ui.primaryOn },
  btnMessage: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  btnMessageText: { fontSize: 14, fontWeight: '600', color: ui.textPrimary },
  btnDecline: { paddingHorizontal: 12, paddingVertical: 10 },
  btnDeclineText: { fontSize: 14, fontWeight: '600', color: '#B91C1C' },
  btnCounter: {
    width: '100%',
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: ui.primary,
    alignItems: 'center',
  },
  btnCounterText: { fontSize: 14, fontWeight: '700', color: ui.primary },
  negotiationMeta: { fontSize: 12, color: ui.textMuted, lineHeight: 16 },
});
