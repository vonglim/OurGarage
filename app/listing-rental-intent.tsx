import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Image, StyleSheet, Text, TextInput, View, type ScrollView } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { BackHeader } from '@/components/AppHeaders';
import { ListingOfferDatesStep } from '@/components/makeOfferFlow/ListingOfferDatesStep';
import { ThreeLinePreferenceCards, type ThreeLineOption } from '@/components/makeOfferFlow/ThreeLinePreferenceCards';
import { WizardChrome } from '@/components/makeOfferFlow/WizardChrome';
import { Pressable } from '@/components/Pressable';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { WizardSubtitle } from '@/components/WizardSubtitle';
import { ui } from '@/constants/appUi';
import { wizardStepTitleStyle } from '@/constants/wizardCopy';
import { useAuthUserId } from '@/lib/authUser';
import { hydrateListingsFromSupabase } from '@/lib/hydrateListingsFromSupabase';
import { insertRentalRequest, type HandoffPreference } from '@/lib/insertRentalRequest';
import { buildListingIntentSnapshot } from '@/lib/listingIntentSnapshot';
import { billingDaysInclusive, isDateRangeAvailable } from '@/lib/listingAvailability';
import { compareIsoDate, formatIsoDateMedium } from '@/lib/listingAvailabilityDates';
import { computeListingRentalRequestPricing } from '@/lib/rentalPricing';
import { isToolListingOwner } from '@/lib/listingOwnership';
import { RentalPricingBreakdown } from '@/components/rentalPricing';
import { normalizeListingImages } from '@/lib/normalizeListingImages';
import { showFeedbackToast } from '@/store/feedbackToastStore';
import {
  hydrateListingAvailability,
  useListingAvailabilityStore,
} from '@/store/listingAvailabilityStore';
import { getListingById } from '@/store/listingsStore';
import type { ToolListing } from '@/store/listingsStore';

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

const HANDOFF_OPTIONS: readonly ThreeLineOption<HandoffPreference>[] = [
  { key: 'pickup', title: 'Pickup', line: 'I’ll meet the owner to pick up the item.' },
  { key: 'owner_delivery', title: 'Delivery', line: 'The owner delivers the item to me.' },
  { key: 'either', title: 'Either', line: 'I’m flexible on pickup or delivery.' },
];

type WizardStep = 1 | 2 | 3;

export default function ListingRentalIntentScreen() {
  const router = useRouter();
  const currentUserId = useAuthUserId();
  const params = useLocalSearchParams<{
    listingId?: string | string[];
    durationKey?: string | string[];
  }>();
  const listingId = firstParam(params.listingId)?.trim();
  const durationKey = (firstParam(params.durationKey) === 'multi' ? 'multi' : 'full') as 'full' | 'multi';

  const mainScrollRef = useRef<ScrollView>(null);
  const submitInFlight = useRef(false);
  const [step, setStep] = useState<WizardStep>(1);
  const [rentalStartIso, setRentalStartIso] = useState<string | null>(null);
  const [rentalEndIso, setRentalEndIso] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<HandoffPreference>('either');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const dateDraft = useMemo(
    () => ({ rentalStartIso, rentalEndIso }),
    [rentalStartIso, rentalEndIso]
  );

  useFocusEffect(
    useCallback(() => {
      void hydrateListingsFromSupabase();
    }, [])
  );

  const listing = useMemo(() => (listingId ? getListingById(listingId) : undefined), [listingId]);

  const rows = useListingAvailabilityStore((s) => (listingId ? s.byListingId[listingId] ?? [] : []));

  useEffect(() => {
    if (listingId) void hydrateListingAvailability(listingId);
  }, [listingId]);

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

  useLayoutEffect(() => {
    mainScrollRef.current?.scrollTo({ y: 0, animated: false });
    const id = requestAnimationFrame(() => {
      mainScrollRef.current?.scrollTo({ y: 0, animated: false });
    });
    return () => cancelAnimationFrame(id);
  }, [step]);

  const durationType = durationKey === 'multi' ? ('multiDay' as const) : ('full' as const);

  const billingDays = useMemo(() => {
    if (!rentalStartIso || !rentalEndIso) return 1;
    return Math.max(1, billingDaysInclusive(rentalStartIso, rentalEndIso));
  }, [rentalStartIso, rentalEndIso]);

  const canContinue = useMemo(() => {
    if (step === 1) {
      const s = rentalStartIso?.trim() ?? '';
      const e = rentalEndIso?.trim() ?? '';
      if (!s || !e) return false;
      return isDateRangeAvailable(s, e, rows);
    }
    if (step === 2) return true;
    return Boolean(rentalStartIso?.trim() && rentalEndIso?.trim());
  }, [step, rentalStartIso, rentalEndIso, rows]);

  const onChangeDates = useCallback((start: string | null, end: string | null) => {
    setRentalStartIso(start);
    setRentalEndIso(end);
  }, []);

  const goBack = useCallback(() => {
    if (submitting) return;
    if (step <= 1) {
      router.back();
      return;
    }
    setStep((s) => (s - 1) as WizardStep);
  }, [step, router, submitting]);

  const goNext = useCallback(() => {
    if (step < 3) setStep((s) => (s + 1) as WizardStep);
  }, [step]);

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
    const start = rentalStartIso?.trim() ?? '';
    const end = rentalEndIso?.trim() ?? '';
    if (!start || !end) {
      showFeedbackToast('Choose rental dates to continue.');
      return;
    }
    if (compareIsoDate(end, start) < 0) {
      showFeedbackToast('Return date must be on or after pickup date.');
      return;
    }
    if (submitInFlight.current) return;
    submitInFlight.current = true;
    setSubmitting(true);
    try {
      const images = normalizeListingImages((listing as ToolListing & { images?: string[] }).images).filter(Boolean);
      const snapshot = buildListingIntentSnapshot(listing, images);
      const r = await insertRentalRequest({
        listingId,
        renterUserId: renterId,
        durationType,
        price: computeListingRentalRequestPricing({
          listing,
          rentalStartIso: start,
          rentalEndIso: end,
          durationKey,
          handoff,
        }).finalComputedTotal,
        listingSnapshot: snapshot,
        requestedStartDate: start,
        requestedEndDate: end,
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
      submitInFlight.current = false;
    }
  }, [
    listingId,
    listing,
    currentUserId,
    isOwn,
    rentalStartIso,
    rentalEndIso,
    durationType,
    durationKey,
    handoff,
    message,
    router,
  ]);

  const rentalPricing = useMemo(() => {
    if (!listing) return null;
    return computeListingRentalRequestPricing({
      listing,
      rentalStartIso,
      rentalEndIso,
      durationKey,
      handoff,
    });
  }, [listing, rentalStartIso, rentalEndIso, durationKey, handoff]);

  const onFooterPress = useCallback(() => {
    if (!canContinue || submitting) return;
    if (step < 3) {
      goNext();
      return;
    }
    void onSubmit();
  }, [canContinue, step, goNext, submitting, onSubmit]);

  const footerLabel =
    step === 3 ? (submitting ? 'Sending…' : 'Send rental request') : 'Continue';

  const chromeSubtitle =
    step === 1 ? 'Choose your rental window' : step === 2 ? undefined : listing?.name;

  const reviewBody = useMemo(() => {
    if (!listing) return null;
    const pref = rentalPricing?.handoffSummaryLine ?? '—';
    const msgTrim = message.trim();
    return (
      <View style={styles.pad}>
        <Text style={wizardStepTitleStyle}>Review & send</Text>
        <WizardSubtitle>Confirm your rental request before sending it to the host.</WizardSubtitle>
        {heroUrl ? (
          <Image source={{ uri: heroUrl }} style={styles.hero} resizeMode="cover" accessibilityLabel="Listing" />
        ) : (
          <View style={[styles.hero, styles.heroPh]} />
        )}
        <Text style={styles.listTitle}>{listing.name}</Text>
        <View style={styles.kv}>
          <Text style={styles.kvK}>Dates</Text>
          <Text style={styles.kvV}>
            {rentalStartIso && rentalEndIso
              ? `${formatIsoDateMedium(rentalStartIso)} → ${formatIsoDateMedium(rentalEndIso)}`
              : '—'}
          </Text>
        </View>
        <View style={styles.kv}>
          <Text style={styles.kvK}>Duration</Text>
          <Text style={styles.kvV}>{billingDays} day(s)</Text>
        </View>
        <View style={styles.kv}>
          <Text style={styles.kvK}>Pickup / delivery</Text>
          <Text style={styles.kvV}>{pref}</Text>
        </View>
        {rentalPricing ? <RentalPricingBreakdown pricing={rentalPricing} /> : null}
        {msgTrim ? (
          <View style={styles.messagePreview}>
            <Text style={styles.kvK}>Message to host</Text>
            <Text style={styles.messagePreviewText}>{msgTrim}</Text>
          </View>
        ) : null}
        <View style={styles.editRow}>
          <Pressable onPress={() => setStep(1)} style={({ pressed }) => [styles.linkWrap, pressed && { opacity: 0.85 }]}>
            <Text style={styles.link}>Edit dates</Text>
          </Pressable>
          <Text style={styles.dot}> · </Text>
          <Pressable onPress={() => setStep(2)} style={({ pressed }) => [styles.linkWrap, pressed && { opacity: 0.85 }]}>
            <Text style={styles.link}>Edit preference</Text>
          </Pressable>
        </View>
      </View>
    );
  }, [
    listing,
    heroUrl,
    rentalStartIso,
    rentalEndIso,
    billingDays,
    handoff,
    rentalPricing,
    message,
  ]);

  const body = useMemo(() => {
    if (!listingId) return null;
    if (step === 1) {
      return (
        <ListingOfferDatesStep
          listingId={listingId}
          rows={rows}
          draft={dateDraft}
          onChangeDates={onChangeDates}
        />
      );
    }
    if (step === 2) {
      return (
        <View style={styles.pad}>
          <Text style={wizardStepTitleStyle}>How would you like to get it?</Text>
          <ThreeLinePreferenceCards options={HANDOFF_OPTIONS} value={handoff} onChange={setHandoff} />
          <WizardSubtitle outerStyle={styles.helperAfterCards}>
            Delivery availability depends on the owner&apos;s settings.
          </WizardSubtitle>
          <Text style={styles.fieldLabel}>Message to host (optional)</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Timing, access, or questions…"
            placeholderTextColor={ui.textSecondary}
            multiline
            style={styles.messageInput}
          />
        </View>
      );
    }
    return reviewBody;
  }, [
    listingId,
    step,
    rows,
    dateDraft,
    onChangeDates,
    handoff,
    message,
    reviewBody,
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
    <ScreenWrapper style={{ backgroundColor: ui.background }} innerStyle={{ flex: 1 }}>
      <ScreenEntrance style={{ flex: 1 }}>
        <WizardChrome
          title="Request rental"
          subtitle={chromeSubtitle}
          stepIndex={step}
          totalSteps={3}
          scrollViewRef={mainScrollRef}
          onBack={goBack}
          footerLabel={footerLabel}
          footerDisabled={!canContinue || submitting}
          onFooterPress={onFooterPress}
          secondaryFooterLabel={step === 3 ? 'Back' : undefined}
          onSecondaryFooterPress={step === 3 ? () => setStep(2) : undefined}
        >
          <Animated.View key={step} entering={FadeIn.duration(200)}>
            {body}
          </Animated.View>
        </WizardChrome>
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
  pad: {
    paddingHorizontal: 4,
    paddingTop: 8,
  },
  helperAfterCards: {
    marginTop: ui.spaceSm,
    marginBottom: ui.spaceMd,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 6,
  },
  messageInput: {
    minHeight: 88,
    borderRadius: ui.radiusInput,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    padding: 12,
    fontSize: 16,
    color: ui.textPrimary,
    backgroundColor: ui.background,
    textAlignVertical: 'top',
  },
  hero: {
    width: '100%',
    height: 140,
    borderRadius: ui.radiusInput,
    marginBottom: ui.spaceMd,
    backgroundColor: ui.surfaceNeutral,
  },
  heroPh: {},
  listTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: ui.spaceMd,
  },
  kv: {
    marginBottom: 10,
  },
  kvK: {
    fontSize: 13,
    fontWeight: '600',
    color: ui.textSecondary,
    marginBottom: 2,
  },
  kvV: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.textPrimary,
  },
  messagePreview: {
    marginTop: ui.spaceSm,
    marginBottom: ui.spaceSm,
  },
  messagePreviewText: {
    fontSize: 15,
    color: ui.textPrimary,
    lineHeight: 22,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: ui.spaceMd,
    flexWrap: 'wrap',
  },
  linkWrap: {
    paddingVertical: 4,
  },
  link: {
    fontSize: 15,
    fontWeight: '700',
    color: ui.primary,
  },
  dot: {
    fontSize: 15,
    color: ui.textSecondary,
  },
});
