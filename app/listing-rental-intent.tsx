import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/AppHeaders';
import { Pressable } from '@/components/Pressable';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { ui } from '@/constants/appUi';
import { useAuthUserId } from '@/lib/authUser';
import { hydrateListingsFromSupabase } from '@/lib/hydrateListingsFromSupabase';
import { insertRentalRequest, type HandoffPreference } from '@/lib/insertRentalRequest';
import { buildListingIntentSnapshot } from '@/lib/listingIntentSnapshot';
import { isToolListingOwner } from '@/lib/listingOwnership';
import { formatUsd } from '@/lib/money';
import { normalizeListingImages } from '@/lib/normalizeListingImages';
import { showFeedbackToast } from '@/store/feedbackToastStore';
import { getListingById } from '@/store/listingsStore';
import type { ToolListing } from '@/store/listingsStore';

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addLocalDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return startOfLocalDay(x);
}

function formatLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function tomorrowBase(): Date {
  return addLocalDays(startOfLocalDay(new Date()), 1);
}

const HANDOFF_OPTIONS: { key: HandoffPreference; label: string }[] = [
  { key: 'pickup', label: 'Pickup' },
  { key: 'owner_delivery', label: 'Delivery' },
  { key: 'either', label: 'Either' },
];

export default function ListingRentalIntentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const currentUserId = useAuthUserId();
  const params = useLocalSearchParams<{
    listingId?: string | string[];
    durationKey?: string | string[];
    dayCount?: string | string[];
    price?: string | string[];
  }>();
  const listingId = firstParam(params.listingId)?.trim();
  const durationKey = firstParam(params.durationKey) === 'multi' ? 'multi' : 'full';
  const dayCount = Math.max(1, parseInt(firstParam(params.dayCount) ?? '1', 10) || 1);
  const priceFromListing = parseFloat(firstParam(params.price) ?? '0') || 0;

  const [picker, setPicker] = useState<'start' | 'end' | null>(null);
  const [startDate, setStartDate] = useState(() => tomorrowBase());
  const [endDate, setEndDate] = useState(() => {
    const span = durationKey === 'multi' ? Math.max(1, dayCount - 1) : 0;
    return addLocalDays(tomorrowBase(), span);
  });
  const [handoff, setHandoff] = useState<HandoffPreference>('either');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void hydrateListingsFromSupabase();
    }, [])
  );

  const listing = useMemo(() => (listingId ? getListingById(listingId) : undefined), [listingId]);

  const heroUrl = useMemo(() => {
    if (!listing) return null;
    const urls = normalizeListingImages((listing as ToolListing & { images?: string[] }).images)
      .map((u) => u.trim())
      .filter(Boolean);
    return urls[0] ?? null;
  }, [listing]);

  const isOwn = useMemo(
    () => isToolListingOwner(listing, currentUserId),
    [listing, currentUserId]
  );

  const durationType = durationKey === 'multi' ? ('multiDay' as const) : ('full' as const);

  const onSubmit = useCallback(async () => {
    if (!listingId || !listing) return;
    const renterId = currentUserId.trim();
    if (!renterId) {
      showFeedbackToast('Sign in to request this rental.');
      return;
    }
    if (isOwn) {
      showFeedbackToast('You can’t request your own listing.');
      return;
    }
    if (endDate.getTime() < startDate.getTime()) {
      showFeedbackToast('Return date must be on or after pickup date.');
      return;
    }
    setSubmitting(true);
    try {
      const images = normalizeListingImages((listing as ToolListing & { images?: string[] }).images).filter(Boolean);
      const snapshot = buildListingIntentSnapshot(listing, images);
      const r = await insertRentalRequest({
        listingId,
        renterUserId: renterId,
        durationType,
        price: priceFromListing > 0 ? priceFromListing : listing.price,
        listingSnapshot: snapshot,
        requestedStartDate: formatLocalIsoDate(startDate),
        requestedEndDate: formatLocalIsoDate(endDate),
        handoffPreference: handoff,
        renterMessage: message.trim() || null,
      });
      if (r.ok) {
        showFeedbackToast('Rental request sent');
        router.back();
      } else {
        showFeedbackToast(r.message);
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    listingId,
    listing,
    currentUserId,
    isOwn,
    endDate,
    startDate,
    durationType,
    priceFromListing,
    handoff,
    message,
    router,
  ]);

  if (!listingId) {
    return (
      <ScreenWrapper style={styles.wrap}>
        <Text style={styles.muted}>Missing listing.</Text>
      </ScreenWrapper>
    );
  }

  if (!listing) {
    return (
      <ScreenWrapper style={styles.wrap}>
        <ScreenEntrance style={styles.centered}>
          <Text style={styles.muted}>Loading listing…</Text>
        </ScreenEntrance>
      </ScreenWrapper>
    );
  }

  if (isOwn) {
    return (
      <ScreenWrapper style={styles.wrap}>
        <BackHeader title="Request rental" onBack={() => router.back()} />
        <Text style={styles.muted}>You can’t request your own listing.</Text>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper style={styles.wrap} innerStyle={{ flex: 1 }}>
      <ScreenEntrance style={{ flex: 1 }}>
        <BackHeader title="Request rental" subtitle={listing.name} onBack={() => router.back()} />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.heroRow}>
            {heroUrl ? (
              <Image source={{ uri: heroUrl }} style={styles.hero} resizeMode="cover" accessibilityLabel="" />
            ) : (
              <View style={[styles.hero, styles.heroPh]} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{listing.name}</Text>
              <Text style={styles.priceHint}>
                Indicative total from listing:{' '}
                {priceFromListing > 0 ? formatUsd(priceFromListing) : formatUsd(listing.price)}
              </Text>
            </View>
          </View>

          <Text style={styles.section}>Dates</Text>
          <Pressable
            onPress={() => setPicker('start')}
            style={({ pressed }) => [styles.dateCell, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.dateLabel}>Pickup</Text>
            <Text style={styles.dateValue}>{formatLocalIsoDate(startDate)}</Text>
          </Pressable>
          <Pressable
            onPress={() => setPicker('end')}
            style={({ pressed }) => [styles.dateCell, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.dateLabel}>Return</Text>
            <Text style={styles.dateValue}>{formatLocalIsoDate(endDate)}</Text>
          </Pressable>

          <Text style={styles.section}>Pickup / delivery preference</Text>
          <View style={styles.chipRow}>
            {HANDOFF_OPTIONS.map(({ key, label }) => {
              const on = handoff === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setHandoff(key)}
                  style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && { opacity: 0.9 }]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.section}>Message to host (optional)</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Timing, access, or questions…"
            placeholderTextColor={ui.textSecondary}
            multiline
            style={styles.messageInput}
          />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom }]}>
          <Pressable
            pressOpacityFeedback={false}
            haptic
            disabled={submitting}
            onPress={() => void onSubmit()}
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && styles.primaryBtnPressed,
              submitting && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.primaryBtnText}>{submitting ? 'Sending…' : 'Send rental request'}</Text>
          </Pressable>
        </View>

        <Modal visible={picker != null} transparent animationType="fade">
          <Pressable style={styles.modalBackdrop} onPress={() => setPicker(null)}>
            <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.modalTitle}>{picker === 'start' ? 'Pickup date' : 'Return date'}</Text>
              {picker ? (
                <DateTimePicker
                  value={picker === 'start' ? startDate : endDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  themeVariant="light"
                  onChange={(_, d) => {
                    if (!d) return;
                    const next = startOfLocalDay(d);
                    if (picker === 'start') {
                      setStartDate(next);
                      setEndDate((prev) => (prev.getTime() < next.getTime() ? next : prev));
                    } else {
                      setEndDate(next);
                    }
                  }}
                />
              ) : null}
              <Pressable onPress={() => setPicker(null)} style={styles.modalDone}>
                <Text style={styles.modalDoneText}>Done</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      </ScreenEntrance>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: ui.surfaceGrouped,
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  muted: {
    fontSize: 15,
    color: ui.textSecondary,
    textAlign: 'center',
    padding: 24,
  },
  heroRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: ui.spaceMd,
  },
  hero: {
    width: 88,
    height: 88,
    borderRadius: ui.radiusInput,
    backgroundColor: ui.surfaceNeutral,
  },
  heroPh: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 4,
  },
  priceHint: {
    fontSize: 14,
    color: ui.textSecondary,
  },
  section: {
    fontSize: 15,
    fontWeight: '700',
    color: ui.textPrimary,
    marginTop: ui.spaceMd,
    marginBottom: ui.spaceSm,
  },
  dateCell: {
    paddingVertical: 14,
    paddingHorizontal: ui.spaceMd,
    borderRadius: ui.radiusInput,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    backgroundColor: ui.background,
    marginBottom: ui.spaceSm,
  },
  dateLabel: {
    fontSize: 13,
    color: ui.textSecondary,
    marginBottom: 4,
  },
  dateValue: {
    fontSize: 17,
    fontWeight: '600',
    color: ui.textPrimary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    backgroundColor: ui.background,
  },
  chipOn: {
    borderColor: ui.primary,
    backgroundColor: ui.surfaceTintPrimary,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.textPrimary,
  },
  chipTextOn: {
    color: ui.primary,
  },
  messageInput: {
    minHeight: 100,
    borderRadius: ui.radiusInput,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    padding: 12,
    fontSize: 16,
    color: ui.textPrimary,
    backgroundColor: ui.background,
    textAlignVertical: 'top',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: ui.spaceMd,
    backgroundColor: ui.surfaceGrouped,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ui.border,
  },
  primaryBtn: {
    marginHorizontal: 0,
    paddingVertical: ui.padButtonV,
    borderRadius: ui.radiusButton,
    backgroundColor: ui.primary,
    alignItems: 'center',
  },
  primaryBtnPressed: {
    backgroundColor: ui.primaryPressed,
  },
  primaryBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: ui.primaryOn,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: ui.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: ui.spaceMd,
    paddingBottom: 24,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
    color: ui.textPrimary,
  },
  modalDone: {
    marginTop: 12,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  modalDoneText: {
    fontSize: 16,
    fontWeight: '700',
    color: ui.primary,
  },
});
