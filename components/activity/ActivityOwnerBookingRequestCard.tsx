import { Image } from 'expo-image';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  BookingDetailRow,
  ExpandableBookingCardShell,
  ProtectionBadge,
} from '@/components/activity/ExpandableBookingCardShell';
import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';
import { formatIsoDateMedium } from '@/lib/listingAvailabilityDates';
import type { PendingListingRentalRow } from '@/lib/fetchPendingRentalRequestsForOwner';
import { formatUsd } from '@/lib/money';
import { getPublicProfileForView } from '@/lib/publicProfiles';
import { getRemoteDisplayNameForUserId } from '@/lib/remoteProfileCache';

function durationLabel(durationType: string): string {
  switch (durationType) {
    case 'half':
      return 'Half day';
    case 'full':
      return 'Full day';
    case 'week':
      return 'Weekly';
    case 'multi_day':
      return 'Multi-day';
    default:
      return durationType;
  }
}

function handoffLabel(pref: string | null, snapshot: PendingListingRentalRow['listing_snapshot']): string {
  const p = pref?.trim().toLowerCase() ?? '';
  if (p.includes('deliver')) return 'Delivery requested';
  if (p.includes('pickup')) return 'Pickup';
  if (snapshot?.delivery_available) return 'Delivery available';
  return 'Pickup';
}

function dateRangeLabel(row: PendingListingRentalRow): string {
  const s = row.requested_start_date?.trim();
  const e = row.requested_end_date?.trim();
  if (s && e) return `${formatIsoDateMedium(s)} – ${formatIsoDateMedium(e)}`;
  if (s) return formatIsoDateMedium(s);
  return durationLabel(row.duration_type);
}

type Props = {
  row: PendingListingRentalRow;
  busy?: boolean;
  highlighted?: boolean;
  onApprove: () => void;
  onDecline: () => void;
  onMessage?: () => void;
};

export function ActivityOwnerBookingRequestCard({
  row,
  busy,
  highlighted = false,
  onApprove,
  onDecline,
  onMessage,
}: Props) {
  const snapshot = row.listing_snapshot;
  const title = snapshot?.title?.trim() || row.listings?.title?.trim() || 'Listing';
  const hero = snapshot?.hero_image_url?.trim() ?? null;
  const renterName = getRemoteDisplayNameForUserId(row.renter_user_id) ?? 'Renter';
  const renterProfile = getPublicProfileForView(row.renter_user_id);
  const priceNum = Number(row.price);
  const priceLabel = Number.isFinite(priceNum) ? formatUsd(priceNum) : '—';
  const replacement = snapshot?.replacement_value;

  const earningsHint = useMemo(() => {
    if (!Number.isFinite(priceNum)) return '—';
    const est = priceNum * 0.85;
    return `~${formatUsd(est)} after fees (est.)`;
  }, [priceNum]);

  return (
    <View style={highlighted ? styles.highlightWrap : undefined}>
      <ExpandableBookingCardShell
        defaultExpanded={highlighted}
        expandedContent={
        <>
          <BookingDetailRow label="Area" value={snapshot?.service_area?.trim() || '—'} />
          <BookingDetailRow label="Handoff" value={snapshot?.handoff_summary?.trim() || '—'} />
          <BookingDetailRow label="Renter note" value={row.renter_message?.trim() || '—'} />
          <BookingDetailRow
            label="Replacement value"
            value={replacement != null && Number.isFinite(replacement) ? formatUsd(replacement) : '—'}
          />
          <BookingDetailRow label="Condition" value={snapshot?.condition_label?.trim() || '—'} />
          <BookingDetailRow label="Owner earnings (est.)" value={earningsHint} />
          <View style={styles.futureRow}>
            <Text style={styles.futureChip}>ID verified — soon</Text>
            <Text style={styles.futureChip}>Trust score — soon</Text>
          </View>
        </>
      }
    >
      <View style={styles.body}>
        <View style={styles.topRow}>
          {hero ? (
            <Image source={{ uri: hero }} style={styles.thumb} contentFit="cover" />
          ) : (
            <View style={[styles.thumb, styles.thumbPh]} />
          )}
          <View style={styles.topText}>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {renterName}
              {renterProfile.ratingNumber > 0 ? ` · ★ ${renterProfile.ratingStars}` : ''}
            </Text>
            <Text style={styles.dates}>{dateRangeLabel(row)}</Text>
          </View>
          <View style={styles.statusChip}>
            <Text style={styles.statusChipText}>Pending</Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.payout}>{priceLabel}</Text>
          <Text style={styles.sub}>{handoffLabel(row.handoff_preference, snapshot)}</Text>
          <ProtectionBadge />
        </View>

        <View style={styles.actions}>
          <Pressable
            disabled={busy}
            onPress={onApprove}
            style={({ pressed }) => [styles.btnPrimary, busy && styles.btnDisabled, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.btnPrimaryText}>Approve</Text>
          </Pressable>
          {onMessage ? (
            <Pressable
              disabled={busy}
              onPress={onMessage}
              style={({ pressed }) => [styles.btnSecondary, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.btnSecondaryText}>Message</Text>
            </Pressable>
          ) : null}
          <Pressable
            disabled={busy}
            onPress={onDecline}
            style={({ pressed }) => [styles.btnDecline, busy && styles.btnDisabled, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.btnDeclineText}>Decline</Text>
          </Pressable>
        </View>
      </View>
    </ExpandableBookingCardShell>
    </View>
  );
}

const styles = StyleSheet.create({
  highlightWrap: {
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#F59E0B',
    marginBottom: 4,
  },
  body: { padding: 12 },
  topRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  thumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: '#E2E8F0' },
  thumbPh: { backgroundColor: '#F1F5F9' },
  topText: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontWeight: '700', color: ui.textPrimary },
  meta: { marginTop: 2, fontSize: 13, color: ui.textSecondary },
  dates: { marginTop: 2, fontSize: 12, fontWeight: '600', color: ui.textPrimary },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#FEF3C7',
  },
  statusChipText: { fontSize: 10, fontWeight: '800', color: '#92400E' },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10 },
  payout: { fontSize: 18, fontWeight: '800', color: ui.textPrimary },
  sub: { fontSize: 13, color: ui.textSecondary },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btnPrimary: {
    flex: 1,
    backgroundColor: ui.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  btnSecondary: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  btnSecondaryText: { fontWeight: '600', fontSize: 14, color: ui.textPrimary },
  btnDecline: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  btnDeclineText: { fontWeight: '600', fontSize: 14, color: '#B91C1C' },
  btnDisabled: { opacity: 0.5 },
  futureRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  futureChip: {
    fontSize: 10,
    color: ui.textMuted,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
});
