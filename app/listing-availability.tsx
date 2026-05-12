import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/AppHeaders';
import { ListingAvailabilityCalendar } from '@/components/calendar/ListingAvailabilityCalendar';
import { Pressable } from '@/components/Pressable';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ui } from '@/constants/appUi';
import { useAuthUserId } from '@/lib/authUser';
import {
  dayVisualState,
  deleteOwnerBlockedRow,
  findBlockedRowsCoveringDay,
  insertOwnerBlockedRange,
} from '@/lib/listingAvailability';
import { hydrateListingsFromSupabase } from '@/lib/hydrateListingsFromSupabase';
import { isToolListingOwner } from '@/lib/listingOwnership';
import { getListingById } from '@/store/listingsStore';
import { showFeedbackToast } from '@/store/feedbackToastStore';
import {
  hydrateListingAvailability,
  useListingAvailabilityStore,
} from '@/store/listingAvailabilityStore';

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export default function ListingAvailabilityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useAuthUserId();
  const params = useLocalSearchParams<{ listingId?: string | string[] }>();
  const listingId = firstParam(params.listingId)?.trim() ?? '';
  const listing = useMemo(() => (listingId ? getListingById(listingId) : undefined), [listingId]);
  const rows = useListingAvailabilityStore((s) => s.byListingId[listingId] ?? []);
  const [busy, setBusy] = useState(false);

  const isOwner = useMemo(() => isToolListingOwner(listing, me), [listing, me]);

  useFocusEffect(
    useCallback(() => {
      void hydrateListingsFromSupabase();
      if (listingId) void hydrateListingAvailability(listingId);
    }, [listingId])
  );

  const onOwnerDayPress = useCallback(
    async (iso: string, visual: ReturnType<typeof dayVisualState>) => {
      if (!listingId || !isOwner || busy) return;
      if (visual === 'booked' || visual === 'pending') {
        showFeedbackToast('Booked and pending holds can’t be edited here.');
        return;
      }
      setBusy(true);
      try {
        if (visual === 'blocked') {
          const covering = findBlockedRowsCoveringDay(rows, iso);
          const row = covering[0];
          if (!row) {
            showFeedbackToast('Couldn’t find a block to remove.');
            return;
          }
          const r = await deleteOwnerBlockedRow(row.id);
          if (!r.ok) {
            showFeedbackToast(r.message ?? 'Couldn’t update availability.');
            return;
          }
          showFeedbackToast('Unblocked');
        } else {
          const r = await insertOwnerBlockedRange({ listingId, startIso: iso, endIso: iso });
          if (!r.ok) {
            showFeedbackToast(r.message ?? 'Couldn’t block that day.');
            return;
          }
          showFeedbackToast('Blocked');
        }
        await hydrateListingAvailability(listingId);
      } finally {
        setBusy(false);
      }
    },
    [listingId, isOwner, busy, rows]
  );

  if (!listingId) {
    return (
      <ScreenWrapper style={styles.wrap}>
        <Text style={styles.muted}>Missing listing.</Text>
      </ScreenWrapper>
    );
  }

  if (!listing || !isOwner) {
    return (
      <ScreenWrapper style={styles.wrap}>
        <ScreenEntrance style={styles.center}>
          <Text style={styles.muted}>Only the listing host can manage availability.</Text>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Go back</Text>
          </Pressable>
        </ScreenEntrance>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper style={styles.wrap}>
      <ScreenEntrance style={styles.flex}>
        <BackHeader title="Manage availability" onBack={() => router.back()} />
        <Text style={styles.lead}>
          Tap a day to block or unblock. Booked and pending stays are read-only.
        </Text>
        <View style={styles.legend}>
          <LegendDot color="rgba(15, 118, 110, 0.45)" label="Available" />
          <LegendDot color="rgba(107, 114, 128, 0.75)" label="Blocked" />
          <LegendDot color="#F59E0B" label="Pending" />
          <LegendDot color="rgba(55, 65, 81, 0.85)" label="Booked" />
        </View>
        <View style={styles.calWrap}>
          {busy ? (
            <View style={styles.busy}>
              <ActivityIndicator color={ui.primary} />
            </View>
          ) : null}
          <ListingAvailabilityCalendar listingId={listingId} selectionMode="ownerDay" onOwnerDayPress={onOwnerDayPress} />
        </View>
        <Text style={styles.hint}>Blackout ranges: tap individual days to block; tap again to unblock.</Text>
        <View style={{ height: insets.bottom + 8 }} />
      </ScreenEntrance>
    </ScreenWrapper>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  muted: {
    fontSize: 16,
    color: ui.textSecondary,
    textAlign: 'center',
    padding: 24,
  },
  lead: {
    fontSize: 15,
    color: ui.textSecondary,
    lineHeight: 22,
    marginBottom: ui.spaceSm,
    paddingHorizontal: 4,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: ui.spaceSm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: ui.textSecondary,
  },
  calWrap: {
    flex: 1,
    borderRadius: ui.radiusInput,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    backgroundColor: '#FFFFFF',
  },
  busy: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.35)',
    zIndex: 2,
  },
  hint: {
    fontSize: 13,
    color: ui.textSecondary,
    marginTop: ui.spaceSm,
    paddingHorizontal: 4,
  },
  backBtn: {
    marginTop: ui.spaceMd,
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: ui.radiusButton,
    backgroundColor: ui.primary,
  },
  backBtnText: {
    color: ui.primaryOn,
    fontWeight: '700',
    fontSize: 16,
  },
});
