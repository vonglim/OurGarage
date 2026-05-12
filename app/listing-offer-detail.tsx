import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/AppHeaders';
import { Pressable } from '@/components/Pressable';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ui } from '@/constants/appUi';
import { useAuthUserId } from '@/lib/authUser';
import { hydrateListingOffersFromSupabase } from '@/lib/hydrateListingOffersFromSupabase';
import { fetchListingOfferDetail, ownerSetListingOfferStatus } from '@/lib/listingOfferLifecycleActions';
import { formatUsd } from '@/lib/money';
import { formatIsoDateMedium } from '@/lib/listingAvailabilityDates';
import { getSupabase } from '@/lib/supabase';
import { showFeedbackToast } from '@/store/feedbackToastStore';

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export default function ListingOfferDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useAuthUserId();
  const params = useLocalSearchParams<{ offerId?: string | string[] }>();
  const offerId = firstParam(params.offerId)?.trim() ?? '';

  const [loading, setLoading] = useState(true);
  const [row, setRow] = useState<Record<string, unknown> | null>(null);
  const [messages, setMessages] = useState<Record<string, unknown>[]>([]);
  const [ownerId, setOwnerId] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!offerId) {
      setRow(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { row: r, messages: m } = await fetchListingOfferDetail(offerId);
      setRow(r);
      setMessages(m);
      if (r) {
        const lid = typeof r.listing_id === 'string' ? r.listing_id.trim() : '';
        if (lid) {
          const sb = getSupabase();
          const { data: listing } = await sb.from('listings').select('user_id').eq('id', lid).maybeSingle();
          const uid =
            listing && typeof (listing as { user_id?: unknown }).user_id === 'string'
              ? String((listing as { user_id: string }).user_id).trim()
              : '';
          setOwnerId(uid);
        } else {
          setOwnerId('');
        }
      } else {
        setOwnerId('');
      }
    } finally {
      setLoading(false);
    }
  }, [offerId]);

  useFocusEffect(
    useCallback(() => {
      void load();
      void hydrateListingOffersFromSupabase();
    }, [load])
  );

  const isOwner = useMemo(() => ownerId !== '' && me.trim() === ownerId, [ownerId, me]);
  const isRenter = useMemo(() => {
    const rid = row && typeof row.user_id === 'string' ? row.user_id.trim() : '';
    return rid !== '' && rid === me.trim();
  }, [row, me]);

  const status = row && typeof row.status === 'string' ? row.status : '';
  const price = useMemo(() => {
    const p = row?.current_price ?? row?.price;
    if (typeof p === 'number' && Number.isFinite(p)) return p;
    if (typeof p === 'string' && p.trim() !== '') return Number(p);
    return 0;
  }, [row]);

  const rentalStart =
    row && typeof row.rental_start_date === 'string' ? row.rental_start_date.slice(0, 10) : '';
  const rentalEnd =
    row && typeof row.rental_end_date === 'string' ? row.rental_end_date.slice(0, 10) : '';

  const onAccept = useCallback(async () => {
    setBusy(true);
    const r = await ownerSetListingOfferStatus(offerId, 'accepted');
    setBusy(false);
    if (!r.ok) {
      showFeedbackToast(r.message ?? 'Could not accept.');
      return;
    }
    showFeedbackToast('Offer accepted');
    void load();
  }, [offerId, load]);

  const onDecline = useCallback(async () => {
    setBusy(true);
    const r = await ownerSetListingOfferStatus(offerId, 'declined');
    setBusy(false);
    if (!r.ok) {
      showFeedbackToast(r.message ?? 'Could not decline.');
      return;
    }
    showFeedbackToast('Offer declined');
    void load();
  }, [offerId, load]);

  const onCounter = useCallback(() => {
    showFeedbackToast('Counter offers will be available soon.');
  }, []);

  if (!offerId) {
    return (
      <ScreenWrapper style={styles.wrap}>
        <Text style={styles.muted}>Missing offer.</Text>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper style={styles.wrap} innerStyle={{ flex: 1 }}>
      <ScreenEntrance style={{ flex: 1 }}>
        <BackHeader title="Listing offer" onBack={() => router.back()} />
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={ui.primary} />
          </View>
        ) : !row ? (
          <Text style={styles.muted}>Offer not found.</Text>
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingBottom: 32 + insets.bottom }}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.statusPill}>{status || 'pending'}</Text>
            <Text style={styles.price}>{formatUsd(price)}</Text>
            {rentalStart && rentalEnd ? (
              <Text style={styles.datesLine}>
                {formatIsoDateMedium(rentalStart)} → {formatIsoDateMedium(rentalEnd)}
              </Text>
            ) : null}
            <Text style={styles.hint}>Negotiation thread</Text>
            {messages.length === 0 ? (
              <Text style={styles.muted}>No messages yet.</Text>
            ) : (
              messages.map((m, i) => {
                const body = typeof m.body === 'string' ? m.body : '';
                const author = typeof m.author_id === 'string' ? m.author_id : '';
                const mine = author === me.trim();
                return (
                  <View
                    key={typeof m.id === 'string' ? m.id : `m-${i}`}
                    style={[styles.msgBubble, mine ? styles.msgMine : styles.msgOther]}
                  >
                    <Text style={[styles.msgText, mine && styles.msgTextMine]}>{body || '—'}</Text>
                  </View>
                );
              })
            )}
            {isOwner && status === 'pending' ? (
              <View style={styles.ownerRow}>
                <Pressable
                  onPress={() => void onAccept()}
                  disabled={busy}
                  style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.9 }, busy && { opacity: 0.6 }]}
                >
                  <Text style={styles.primaryBtnText}>Accept</Text>
                </Pressable>
                <Pressable
                  onPress={() => void onDecline()}
                  disabled={busy}
                  style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.9 }, busy && { opacity: 0.6 }]}
                >
                  <Text style={styles.secondaryBtnText}>Decline</Text>
                </Pressable>
                <Pressable
                  onPress={onCounter}
                  style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.9 }]}
                >
                  <Text style={styles.secondaryBtnText}>Counter</Text>
                </Pressable>
              </View>
            ) : null}
            {isRenter ? (
              <Text style={styles.renterHint}>You’ll see updates here when the host responds.</Text>
            ) : null}
          </ScrollView>
        )}
      </ScreenEntrance>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: ui.surfaceGrouped,
  },
  center: {
    padding: 24,
    alignItems: 'center',
  },
  muted: {
    padding: 24,
    fontSize: 15,
    color: ui.textSecondary,
  },
  statusPill: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: ui.surfaceTintPrimary,
    fontSize: 13,
    fontWeight: '700',
    color: ui.primary,
    overflow: 'hidden',
  },
  price: {
    marginTop: 12,
    fontSize: 28,
    fontWeight: '800',
    color: ui.textPrimary,
  },
  datesLine: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '600',
    color: ui.textPrimary,
  },
  hint: {
    marginTop: 4,
    fontSize: 14,
    color: ui.textSecondary,
    marginBottom: ui.spaceMd,
  },
  msgBubble: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    maxWidth: '92%',
  },
  msgMine: {
    alignSelf: 'flex-end',
    backgroundColor: ui.primary,
  },
  msgOther: {
    alignSelf: 'flex-start',
    backgroundColor: ui.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  msgText: {
    fontSize: 15,
    color: ui.textPrimary,
  },
  msgTextMine: {
    color: ui.primaryOn,
  },
  ownerRow: {
    marginTop: ui.spaceMd,
    gap: 10,
  },
  primaryBtn: {
    paddingVertical: 14,
    borderRadius: ui.radiusButton,
    backgroundColor: ui.primary,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: ui.primaryOn,
  },
  secondaryBtn: {
    paddingVertical: 14,
    borderRadius: ui.radiusButton,
    borderWidth: 2,
    borderColor: ui.primary,
    alignItems: 'center',
    backgroundColor: ui.background,
  },
  secondaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: ui.primary,
  },
  renterHint: {
    marginTop: ui.spaceMd,
    fontSize: 14,
    color: ui.textSecondary,
    lineHeight: 20,
  },
});
