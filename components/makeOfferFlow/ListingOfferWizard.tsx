import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ScrollView } from 'react-native';
import { Image, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useRouter } from 'expo-router';

import { Pressable } from '@/components/Pressable';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { WizardSubtitle } from '@/components/WizardSubtitle';
import { ui } from '@/constants/appUi';
import { wizardStepTitleStyle } from '@/constants/wizardCopy';
import {
  billingDaysInclusive,
  isDateRangeAvailable,
} from '@/lib/listingAvailability';
import {
  mapListingRenterOfferDraftToPayload,
  type ListingRenterOfferDraft,
  type ReceivePreference,
} from '@/lib/listingOfferFromDraft';
import type { ListingIntentSnapshot } from '@/lib/listingIntentSnapshot';
import { formatIsoDateMedium } from '@/lib/listingAvailabilityDates';
import { formatUsd, parseMoneyToNumber, sanitizeMoneyDigits } from '@/lib/money';
import { submitInitialListingOffer } from '@/lib/submitListingOffer';
import { showFeedbackToast } from '@/store/feedbackToastStore';
import type { ToolListing } from '@/store/listingsStore';
import {
  hydrateListingAvailability,
  useListingAvailabilityStore,
} from '@/store/listingAvailabilityStore';

import { ListingOfferDatesStep } from './ListingOfferDatesStep';
import { WizardChrome } from './WizardChrome';

type LStep = 1 | 2 | 3 | 4;

const RECEIVE_OPTIONS: {
  key: ReceivePreference;
  title: string;
  line: string;
}[] = [
  { key: 'pickup', title: 'I can pick it up', line: 'I’ll meet the owner for pickup.' },
  { key: 'delivery', title: 'I’d like delivery', line: 'The owner delivers the item to me.' },
  { key: 'either', title: 'Either works', line: 'I’m flexible on pickup or delivery.' },
];

function seedDraft(listing: ToolListing): ListingRenterOfferDraft {
  const rv =
    listing.meta?.marketValue != null && Number.isFinite(listing.meta.marketValue)
      ? listing.meta.marketValue
      : listing.replacementValue != null && Number.isFinite(listing.replacementValue)
        ? listing.replacementValue
        : 0;
  return {
    rentalStartIso: null,
    rentalEndIso: null,
    receivePreference: 'either',
    deliveryBudgetMax: '',
    dailyOfferRate: String(listing.price > 0 ? listing.price : ''),
    replacementValue: rv > 0 ? String(rv) : '',
  };
}

function describePreference(key: ReceivePreference): string {
  const o = RECEIVE_OPTIONS.find((x) => x.key === key);
  return o?.title ?? '';
}

type Props = {
  listing: ToolListing;
  snapshot: ListingIntentSnapshot;
  ownerUserId: string;
  heroUrl: string | null;
  /** Existing listing-offer thread for this renter, if any (ignored for date conflict checks). */
  existingListingOfferId?: string | null;
};

export function ListingOfferWizard({
  listing,
  snapshot,
  ownerUserId,
  heroUrl,
  existingListingOfferId,
}: Props) {
  const router = useRouter();
  const mainScrollRef = useRef<ScrollView>(null);
  const submitInFlight = useRef(false);
  const [step, setStep] = useState<LStep>(1);
  const [draft, setDraft] = useState<ListingRenterOfferDraft>(() => seedDraft(listing));
  const [submitting, setSubmitting] = useState(false);

  const rows = useListingAvailabilityStore((s) => s.byListingId[listing.id] ?? []);

  useEffect(() => {
    void hydrateListingAvailability(listing.id);
  }, [listing.id]);

  const billingDays = useMemo(() => {
    if (!draft.rentalStartIso || !draft.rentalEndIso) return 1;
    return Math.max(1, billingDaysInclusive(draft.rentalStartIso, draft.rentalEndIso));
  }, [draft.rentalStartIso, draft.rentalEndIso]);

  useLayoutEffect(() => {
    mainScrollRef.current?.scrollTo({ y: 0, animated: false });
    const id = requestAnimationFrame(() => {
      mainScrollRef.current?.scrollTo({ y: 0, animated: false });
    });
    return () => cancelAnimationFrame(id);
  }, [step]);

  const updateDraft = useCallback((patch: Partial<ListingRenterOfferDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const onChangeDates = useCallback((start: string | null, end: string | null) => {
    setDraft((prev) => ({ ...prev, rentalStartIso: start, rentalEndIso: end }));
  }, []);

  const canContinue = useMemo(() => {
    if (step === 1) {
      const s = draft.rentalStartIso?.trim() ?? '';
      const e = draft.rentalEndIso?.trim() ?? '';
      if (!s || !e) return false;
      return isDateRangeAvailable(s, e, rows, {
        ignoreOfferId: existingListingOfferId?.trim() || undefined,
      });
    }
    if (step === 2) return true;
    if (step === 3) {
      const daily = parseMoneyToNumber(sanitizeMoneyDigits(draft.dailyOfferRate));
      const rv = parseMoneyToNumber(sanitizeMoneyDigits(draft.replacementValue));
      const snapRv =
        snapshot.replacement_value != null && Number.isFinite(snapshot.replacement_value)
          ? snapshot.replacement_value
          : null;
      const okRv = (rv != null && rv > 0) || (snapRv != null && snapRv > 0);
      return daily != null && daily > 0 && okRv;
    }
    return true;
  }, [step, draft, snapshot.replacement_value, rows, existingListingOfferId]);

  const goNext = useCallback(() => {
    if (step < 4) setStep((s) => (s + 1) as LStep);
  }, [step]);

  const goBack = useCallback(() => {
    if (submitting) return;
    if (step <= 1) {
      router.back();
      return;
    }
    setStep((s) => (s - 1) as LStep);
  }, [step, router, submitting]);

  const submitOffer = useCallback(async () => {
    if (submitInFlight.current) return;
    const payload = mapListingRenterOfferDraftToPayload(draft, snapshot, billingDays);
    if (!payload) {
      showFeedbackToast('Check your dates, daily offer, and protection value.');
      return;
    }
    submitInFlight.current = true;
    setSubmitting(true);
    try {
      const r = await submitInitialListingOffer({
        listingId: listing.id,
        ownerUserId,
        snapshot,
        payload,
        existingOfferId: existingListingOfferId ?? null,
      });
      if (r.ok) {
        router.replace({
          pathname: '/listing-offer-detail',
          params: { offerId: r.offerId },
        });
      } else {
        showFeedbackToast(r.message);
        void hydrateListingAvailability(listing.id);
      }
    } finally {
      setSubmitting(false);
      submitInFlight.current = false;
    }
  }, [draft, snapshot, billingDays, listing.id, ownerUserId, router, existingListingOfferId]);

  const onFooterPress = useCallback(() => {
    if (!canContinue || submitting) return;
    if (step < 4) {
      goNext();
      return;
    }
    void submitOffer();
  }, [canContinue, step, goNext, submitting, submitOffer]);

  const dailyNum = parseMoneyToNumber(sanitizeMoneyDigits(draft.dailyOfferRate));
  const totalPreview =
    dailyNum != null && dailyNum > 0 ? Math.round(dailyNum * billingDays * 100) / 100 : null;
  const budgetNum = parseMoneyToNumber(sanitizeMoneyDigits(draft.deliveryBudgetMax));

  const footerLabel = step === 4 ? (submitting ? 'Sending…' : 'Send offer') : 'Continue';

  const chromeTitle =
    step === 1
      ? 'Select dates'
      : step === 2
        ? 'Receive item'
        : step === 3
          ? 'Your offer'
          : 'Review';
  const chromeSubtitle =
    step === 1
      ? 'Choose your rental window'
      : step === 2
        ? 'How would you like to receive the item?'
        : step === 3
          ? 'What would you like to offer?'
          : listing.name;

  const body = useMemo(() => {
    if (step === 1) {
      return (
        <ListingOfferDatesStep
          listingId={listing.id}
          rows={rows}
          draft={draft}
          onChangeDates={onChangeDates}
          ignoreOfferId={existingListingOfferId ?? null}
        />
      );
    }
    if (step === 2) {
      return (
        <View style={styles.pad}>
          <Text style={wizardStepTitleStyle}>How would you like to receive the item?</Text>
          <WizardSubtitle>Choose whether you&apos;d prefer pickup or delivery.</WizardSubtitle>
          {RECEIVE_OPTIONS.map(({ key, title, line }) => {
            const on = draft.receivePreference === key;
            return (
              <Pressable
                key={key}
                onPress={() => updateDraft({ receivePreference: key })}
                style={({ pressed }) => [
                  styles.optCard,
                  on && styles.optCardOn,
                  pressed && { opacity: 0.92 },
                ]}
              >
                <Text style={[styles.optTitle, on && styles.optTitleOn]}>{title}</Text>
                <Text style={styles.optLine}>{line}</Text>
              </Pressable>
            );
          })}
          {draft.receivePreference === 'delivery' ? (
            <View style={styles.budgetBlock}>
              <Text style={styles.budgetLabel}>Delivery budget (optional)</Text>
              <Text style={styles.budgetHint}>Max you&apos;re willing to pay for delivery to you.</Text>
              <TextInput
                value={draft.deliveryBudgetMax}
                onChangeText={(t) => updateDraft({ deliveryBudgetMax: sanitizeMoneyDigits(t) })}
                placeholder="$0"
                placeholderTextColor={ui.textSecondary}
                keyboardType="decimal-pad"
                style={styles.input}
              />
            </View>
          ) : null}
        </View>
      );
    }
    if (step === 3) {
      return (
        <View style={styles.pad}>
          <Text style={wizardStepTitleStyle}>What would you like to offer?</Text>
          <WizardSubtitle>Send a daily rate offer to the owner.</WizardSubtitle>
          <Text style={styles.fieldLabel}>Your daily offer</Text>
          <TextInput
            value={draft.dailyOfferRate}
            onChangeText={(t) => updateDraft({ dailyOfferRate: sanitizeMoneyDigits(t) })}
            placeholder="$0 / day"
            placeholderTextColor={ui.textSecondary}
            keyboardType="decimal-pad"
            style={styles.input}
          />
          <Text style={styles.fieldLabel}>Replacement value (protection)</Text>
          <TextInput
            value={draft.replacementValue}
            onChangeText={(t) => updateDraft({ replacementValue: sanitizeMoneyDigits(t) })}
            placeholder="Amount"
            placeholderTextColor={ui.textSecondary}
            keyboardType="decimal-pad"
            style={styles.input}
          />
          <Text style={styles.previewLabel}>Estimated total</Text>
          <Text style={styles.previewValue}>
            {totalPreview != null ? formatUsd(totalPreview) : '—'} for {billingDays} day(s)
          </Text>
        </View>
      );
    }
    const prefLine = describePreference(draft.receivePreference);
    const budgetLine =
      draft.receivePreference === 'delivery'
        ? budgetNum != null && budgetNum > 0
          ? formatUsd(budgetNum)
          : 'Open / to be agreed'
        : '—';
    return (
      <View style={styles.pad}>
        <Text style={wizardStepTitleStyle}>Review your offer</Text>
        <WizardSubtitle>Confirm before sending to the host.</WizardSubtitle>
        {heroUrl ? (
          <Image source={{ uri: heroUrl }} style={styles.hero} resizeMode="cover" accessibilityLabel="Listing" />
        ) : (
          <View style={[styles.hero, styles.heroPh]} />
        )}
        <Text style={styles.listTitle}>{listing.name}</Text>
        <View style={styles.kv}>
          <Text style={styles.kvK}>Start date</Text>
          <Text style={styles.kvV}>
            {draft.rentalStartIso ? formatIsoDateMedium(draft.rentalStartIso) : '—'}
          </Text>
        </View>
        <View style={styles.kv}>
          <Text style={styles.kvK}>End date</Text>
          <Text style={styles.kvV}>
            {draft.rentalEndIso ? formatIsoDateMedium(draft.rentalEndIso) : '—'}
          </Text>
        </View>
        <View style={styles.kv}>
          <Text style={styles.kvK}>Rental duration</Text>
          <Text style={styles.kvV}>{billingDays} day(s)</Text>
        </View>
        <View style={styles.kv}>
          <Text style={styles.kvK}>Your offer</Text>
          <Text style={styles.kvV}>
            {dailyNum != null && dailyNum > 0 ? `${formatUsd(dailyNum)} / day` : '—'}
          </Text>
        </View>
        <View style={styles.kv}>
          <Text style={styles.kvK}>Estimated total</Text>
          <Text style={styles.kvV}>{totalPreview != null ? formatUsd(totalPreview) : '—'}</Text>
        </View>
        <View style={styles.kv}>
          <Text style={styles.kvK}>Delivery preference</Text>
          <Text style={styles.kvV}>{prefLine}</Text>
        </View>
        <View style={styles.kv}>
          <Text style={styles.kvK}>Delivery budget</Text>
          <Text style={styles.kvV}>{budgetLine}</Text>
        </View>
        <View style={styles.editRow}>
          <Pressable onPress={() => setStep(1)} style={({ pressed }) => [styles.linkWrap, pressed && { opacity: 0.85 }]}>
            <Text style={styles.link}>Edit dates</Text>
          </Pressable>
          <Text style={styles.dot}> · </Text>
          <Pressable onPress={() => setStep(2)} style={({ pressed }) => [styles.linkWrap, pressed && { opacity: 0.85 }]}>
            <Text style={styles.link}>Edit receive</Text>
          </Pressable>
          <Text style={styles.dot}> · </Text>
          <Pressable onPress={() => setStep(3)} style={({ pressed }) => [styles.linkWrap, pressed && { opacity: 0.85 }]}>
            <Text style={styles.link}>Edit offer</Text>
          </Pressable>
        </View>
      </View>
    );
  }, [
    step,
    draft,
    updateDraft,
    onChangeDates,
    listing.id,
    listing.name,
    rows,
    heroUrl,
    billingDays,
    totalPreview,
    dailyNum,
    budgetNum,
    existingListingOfferId,
  ]);

  return (
    <ScreenWrapper style={{ backgroundColor: ui.background }} innerStyle={{ flex: 1 }}>
      <ScreenEntrance style={{ flex: 1 }}>
        <WizardChrome
          title={chromeTitle}
          subtitle={chromeSubtitle}
          stepIndex={step <= 3 ? step : 4}
          totalSteps={4}
          reviewMode={step === 4}
          scrollViewRef={mainScrollRef}
          onBack={goBack}
          footerLabel={footerLabel}
          footerDisabled={!canContinue || submitting}
          onFooterPress={onFooterPress}
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
  pad: {
    paddingHorizontal: 4,
    paddingTop: 8,
  },
  optCard: {
    padding: ui.spaceMd,
    borderRadius: ui.radiusInput,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    backgroundColor: ui.background,
    marginBottom: ui.spaceSm,
  },
  optCardOn: {
    borderWidth: 2,
    borderColor: ui.primary,
    backgroundColor: ui.surfaceTintPrimary,
  },
  optTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 4,
  },
  optTitleOn: {
    color: ui.primary,
  },
  optLine: {
    fontSize: 15,
    color: ui.textSecondary,
    lineHeight: 22,
  },
  budgetBlock: {
    marginTop: ui.spaceMd,
  },
  budgetLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 4,
  },
  budgetHint: {
    fontSize: 14,
    color: ui.textSecondary,
    marginBottom: ui.spaceSm,
    lineHeight: 20,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.textPrimary,
    marginTop: ui.spaceMd,
    marginBottom: 6,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    borderRadius: ui.radiusInput,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    color: ui.textPrimary,
    backgroundColor: ui.background,
  },
  previewLabel: {
    marginTop: ui.spaceMd,
    fontSize: 14,
    fontWeight: '600',
    color: ui.textSecondary,
  },
  previewValue: {
    fontSize: 18,
    fontWeight: '700',
    color: ui.textPrimary,
    marginTop: 4,
  },
  hero: {
    width: '100%',
    height: 160,
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
