import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { MAO_SUGGESTION_BG } from '@/components/makeOfferFlow/constants';
import { numberPadAccessoryProps } from '@/components/NumberPadKeyboardAccessory';
import { Pressable } from '@/components/Pressable';
import { WizardSubtitle } from '@/components/WizardSubtitle';
import { cardChrome, ui } from '@/constants/appUi';
import {
  wizardStepTitleStyle,
  wizardTrustCardShell,
  wizardTrustMainTitle,
  wizardTrustSectionBody,
  wizardTrustSectionTitle,
} from '@/constants/wizardCopy';
import { useAuthUserDisplayName } from '@/lib/authUser';
import {
  offerWizardPickPhotoSource,
  pickPhotoFromLibrary,
  takePhotoFromCamera,
} from '@/lib/makeOfferWizardPickImages';
import { formatUsd, parseMoneyToNumber, sanitizeMoneyDigits } from '@/lib/money';
import { uploadOfferImage } from '@/lib/uploadOfferImage';
import { getApproximateLocationZipForRequest } from '@/lib/userLocation';
import { showFeedbackToast } from '@/store/feedbackToastStore';
import {
  newMediaCaptureItemId,
  useMediaCaptureSessionStore,
  type MediaCaptureListingBootstrap,
} from '@/store/mediaCaptureSessionStore';

import {
  buildListingDescription,
  effectiveListingTitle,
  handoffSummaryLine,
  verificationStatusLine,
} from './listingCalculations';
import {
  LISTING_PROGRESS_GREEN,
  MAX_CONDITION_NOTES,
  MAX_LISTING_TOTAL_PHOTOS,
} from './listingConstants';
import { filterListingBrandSuggestions, POPULAR_BRAND_CHIPS, SUGGESTED_INCLUDED_CHIPS, SUGGESTED_RATE_CHIPS } from './listingMockData';
import { useListingNumericKeyboardToolbarSync } from './ListingNumericKeyboardToolbarContext';
import type { ListingCondition, ListingHandoff, ListingPhotoSlot, ListingWizardDraft } from './listingTypes';

type DraftUpdater = (patch: Partial<ListingWizardDraft> | ((prev: ListingWizardDraft) => ListingWizardDraft)) => void;

export type ListingStepsContentProps = {
  draft: ListingWizardDraft;
  updateDraft: DraftUpdater;
  searchRef: React.RefObject<TextInput | null>;
  parentScrollRef?: React.RefObject<ScrollView | null>;
  onEditStep: (step: 1 | 2 | 3 | 4 | 5 | 6 | 7) => void;
};

const CONDITIONS: { key: ListingCondition; title: string; desc: string }[] = [
  { key: 'excellent', title: 'Excellent', desc: 'Looks like new or barely used.' },
  { key: 'good', title: 'Good', desc: 'Light wear that matches normal use.' },
  { key: 'fair', title: 'Fair', desc: 'Visible wear but works reliably.' },
  { key: 'heavy_use', title: 'Heavy Use', desc: 'Well used; still functional and safe.' },
];

function parseDigits(s: string): string {
  return s.replace(/[^\d.]/g, '');
}

async function uploadSlot(uri: string, onDone: (remote: string) => void, onFail: () => void) {
  try {
    const remoteUrl = await uploadOfferImage(uri);
    onDone(remoteUrl);
  } catch {
    showFeedbackToast('Could not upload. Try again.');
    onFail();
  }
}

function draftToListingBootstrap(d: ListingWizardDraft): MediaCaptureListingBootstrap | null {
  const items: { id: string; localUri: string }[] = [];
  if (d.coverPhoto?.localUri) {
    items.push({ id: newMediaCaptureItemId(), localUri: d.coverPhoto.localUri });
  }
  const coverId = items[0]?.id ?? '';
  for (const g of d.galleryPhotos) {
    items.push({ id: newMediaCaptureItemId(), localUri: g.localUri });
  }
  if (!items.length) return null;
  return { items, coverId };
}

/** Step 1 — Photos (premium capture via `/media-capture`) */
export function ListingPhotosStepContent({ draft, updateDraft }: ListingStepsContentProps) {
  const router = useRouter();
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const openMediaCapture = useCallback(() => {
    const boot = draftToListingBootstrap(draftRef.current);
    useMediaCaptureSessionStore.getState().setListingBootstrap(boot);
    router.push('/media-capture');
  }, [router]);

  const totalSlots = draft.coverPhoto ? 1 + draft.galleryPhotos.length : draft.galleryPhotos.length;
  const uploadedCount =
    (draft.coverPhoto?.remoteUrl ? 1 : 0) + draft.galleryPhotos.filter((g) => g.remoteUrl).length;
  const hasCover = Boolean(draft.coverPhoto?.localUri);
  const coverUri = draft.coverPhoto?.remoteUrl ?? draft.coverPhoto?.localUri;

  return (
    <View style={styles.pad}>
      <Text style={styles.h1}>Add photos of your item</Text>
      <WizardSubtitle>
        Clear photos help renters feel confident{'\n'}and get more bookings.
      </WizardSubtitle>

      {!hasCover ? (
        <Pressable
          onPress={openMediaCapture}
          style={({ pressed }) => [styles.captureHeroCard, pressed && { opacity: 0.94 }]}
          accessibilityRole="button"
          accessibilityLabel="Open camera to add listing photos"
        >
          <View style={styles.captureHeroInner}>
            <Ionicons name="camera" size={36} color={ui.primary} />
            <Text style={styles.captureHeroTitle}>Capture photos</Text>
            <Text style={styles.captureHeroSub}>Fullscreen camera · up to {MAX_LISTING_TOTAL_PHOTOS} shots · import OK</Text>
          </View>
        </Pressable>
      ) : (
        <Pressable
          onPress={openMediaCapture}
          style={({ pressed }) => [styles.storefrontHeroCard, pressed && { opacity: 0.97 }]}
          accessibilityRole="button"
          accessibilityLabel="Edit listing photos"
        >
          <View style={styles.storefrontHeroFrame}>
            {coverUri ? (
              <Image source={{ uri: coverUri }} style={styles.storefrontHeroImage} contentFit="cover" />
            ) : null}
            {draft.coverPhoto?.uploading ? (
              <View style={styles.storefrontHeroSpinner}>
                <ActivityIndicator color={ui.primaryOn} />
              </View>
            ) : null}
            <View style={styles.storefrontHeroEditPill} pointerEvents="none">
              <Ionicons name="images-outline" size={16} color="#fff" />
              <Text style={styles.storefrontHeroEditText}>Edit photos</Text>
            </View>
          </View>
        </Pressable>
      )}

      {hasCover ? (
        <>
          {draft.galleryPhotos.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.storefrontThumbRow}
            >
              {draft.galleryPhotos.map((g, i) => (
                <Pressable key={`${g.localUri}-${i}`} onPress={openMediaCapture} style={styles.storefrontThumb}>
                  <Image source={{ uri: g.remoteUrl ?? g.localUri }} style={styles.storefrontThumbImg} contentFit="cover" />
                  {g.uploading ? (
                    <View style={styles.thumbSpin}>
                      <ActivityIndicator size="small" />
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          <Text style={styles.storefrontPhotoMeta}>
            {uploadedCount} / {MAX_LISTING_TOTAL_PHOTOS} on your listing · {totalSlots} selected
          </Text>
        </>
      ) : (
        <Text style={styles.countPillMuted}>0 / {MAX_LISTING_TOTAL_PHOTOS} photos</Text>
      )}
    </View>
  );
}

/** Step 2 */
export function ListingBrandStepContent({ draft, updateDraft, searchRef }: ListingStepsContentProps) {
  const q = draft.brandModelQuery.trim();
  const suggestions = q.length >= 1 ? filterListingBrandSuggestions(q, 4) : [];

  return (
    <View style={styles.pad}>
      <Text style={styles.h1}>What brand and model is it?</Text>
      <WizardSubtitle>Search or type to help renters find{'\n'}your item.</WizardSubtitle>

      <View style={styles.searchShell}>
        <Ionicons name="search" size={20} color={ui.textSecondary} />
        <TextInput
          ref={searchRef}
          value={draft.brandModelQuery}
          onChangeText={(t) => updateDraft({ brandModelQuery: t, brandModelDisplay: '' })}
          placeholder="Search brand or model"
          placeholderTextColor={ui.textSecondary}
          style={styles.searchInput}
          returnKeyType="search"
          blurOnSubmit
          onSubmitEditing={() => Keyboard.dismiss()}
        />
        {draft.brandModelQuery.length > 0 ? (
          <Pressable onPress={() => updateDraft({ brandModelQuery: '', brandModelDisplay: '' })} hitSlop={10}>
            <Ionicons name="close-circle" size={20} color={ui.textSecondary} />
          </Pressable>
        ) : null}
        <Ionicons name="barcode-outline" size={22} color={ui.textSecondary} />
      </View>

      {suggestions.length > 0 ? (
        <View style={styles.suggestWrap}>
          <View style={styles.suggestPanel}>
            {suggestions.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => updateDraft({ brandModelQuery: s.title, brandModelDisplay: s.title })}
                style={({ pressed }) => [styles.suggestRow, pressed && { opacity: 0.88 }]}
              >
                <Text style={styles.suggestTitle}>{s.title}</Text>
                <Text style={styles.suggestSub}>{s.subtitle}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.spacer32} />
      )}

      <Text style={styles.fieldLabel}>Popular brands</Text>
      <View style={styles.chipWrap}>
        {POPULAR_BRAND_CHIPS.map((b) => (
          <Pressable
            key={b}
            pressOpacityFeedback={false}
            onPress={() => updateDraft({ brandModelQuery: b, brandModelDisplay: b })}
            style={({ pressed }) => [styles.chip, pressed && { transform: [{ scale: 0.97 }] }]}
          >
            <Text style={styles.chipText}>{b}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.fieldLabel, { marginTop: 18 }]}>Category (optional)</Text>
      <TextInput
        value={draft.category}
        onChangeText={(t) => updateDraft({ category: t })}
        placeholder="e.g. Power tools, Outdoor"
        placeholderTextColor={ui.textSecondary}
        style={styles.input}
      />
    </View>
  );
}

/** Step 3 */
export function ListingConditionStepContent({ draft, updateDraft }: ListingStepsContentProps) {
  return (
    <View style={styles.pad}>
      <Text style={styles.h1}>What condition is it in?</Text>
      <WizardSubtitle>Honest condition reduces disputes{'\n'}and builds trust.</WizardSubtitle>
      <View style={{ gap: 12 }}>
        {CONDITIONS.map((c) => {
          const on = draft.condition === c.key;
          return (
            <Pressable
              key={c.key}
              pressOpacityFeedback={false}
              onPress={() => updateDraft({ condition: c.key })}
              style={({ pressed }) => [
                styles.condCard,
                on && styles.condCardOn,
                pressed && { transform: [{ scale: 0.985 }] },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.condTitle}>{c.title}</Text>
                <Text style={styles.condDesc}>{c.desc}</Text>
              </View>
              <View style={[styles.radio, on && styles.radioOn]}>
                {on ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.fieldLabel, { marginTop: 18 }]}>Condition notes (optional)</Text>
      <TextInput
        value={draft.conditionNotes}
        onChangeText={(t) => updateDraft({ conditionNotes: t.slice(0, MAX_CONDITION_NOTES) })}
        placeholder="Describe wear, scratches, or issues…"
        placeholderTextColor={ui.textSecondary}
        multiline
        style={[styles.input, { minHeight: 100, textAlignVertical: 'top' }]}
      />
      <Text style={styles.charHint}>
        {draft.conditionNotes.length}/{MAX_CONDITION_NOTES}
      </Text>
    </View>
  );
}

/** Step 4 */
export function ListingIncludedStepContent({ draft, updateDraft }: ListingStepsContentProps) {
  const [pending, setPending] = React.useState('');
  const add = (t: string) => {
    const x = t.trim();
    if (!x || draft.included.includes(x)) return;
    updateDraft((p) => ({ ...p, included: [...p.included, x] }));
    setPending('');
  };
  return (
    <View style={styles.pad}>
      <Text style={styles.h1}>What&apos;s included?</Text>
      <WizardSubtitle>
        Add accessories, batteries, chargers, cases,{'\n'}or anything else included.
      </WizardSubtitle>
      <View style={styles.addRow}>
        <TextInput
          value={pending}
          onChangeText={setPending}
          placeholder="Add an item"
          placeholderTextColor={ui.textSecondary}
          style={styles.addInput}
          returnKeyType="done"
          onSubmitEditing={() => add(pending)}
        />
        <Pressable onPress={() => add(pending)} hitSlop={8}>
          <Ionicons name="add-circle-outline" size={26} color={ui.primary} />
        </Pressable>
      </View>
      {draft.included.length > 0 ? (
        <View style={[styles.chipWrap, styles.includedChipsBelowAdd]}>
          {draft.included.map((item) => (
            <View key={item} style={styles.incChip}>
              <Text style={styles.chipText}>{item}</Text>
              <Pressable onPress={() => updateDraft((p) => ({ ...p, included: p.included.filter((x) => x !== item) }))}>
                <Ionicons name="close" size={16} color={ui.textSecondary} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Suggested</Text>
      <View style={styles.chipWrap}>
        {SUGGESTED_INCLUDED_CHIPS.map((s) => (
          <Pressable key={s} onPress={() => add(`+ ${s}`)} style={styles.chip}>
            <Text style={styles.chipText}>+ {s}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Step 5 */
export function ListingHandoffStepContent({ draft, updateDraft, parentScrollRef }: ListingStepsContentProps) {
  const { onNumericFocus, onNumericBlur } = useListingNumericKeyboardToolbarSync();
  const nudge = useCallback(() => {
    requestAnimationFrame(() => setTimeout(() => parentScrollRef?.current?.scrollToEnd({ animated: true }), 80));
  }, [parentScrollRef]);

  const deliveryish = draft.handoff === 'delivery' || draft.handoff === 'both';
  const [locBusy, setLocBusy] = React.useState(false);

  const handoffCards: { key: ListingHandoff; title: string; desc: string }[] = [
    { key: 'pickup_only', title: 'Pickup only', desc: 'Renters pick up from you.' },
    { key: 'delivery', title: 'I offer delivery', desc: 'You drop off and pick up.' },
    { key: 'both', title: 'Both pickup & delivery', desc: 'Let renters choose what works.' },
  ];

  return (
    <View style={styles.pad}>
      <Text style={styles.h1}>How will you get the item to renters?</Text>
      <WizardSubtitle>Choose how pickup and delivery work{'\n'}for this listing.</WizardSubtitle>
      {handoffCards.map((h) => {
        const on = draft.handoff === h.key;
        return (
          <Pressable
            key={h.key}
            pressOpacityFeedback={false}
            onPress={() => updateDraft({ handoff: h.key })}
            style={({ pressed }) => [styles.delCard, on && styles.delCardOn, pressed && { transform: [{ scale: 0.985 }] }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.delTitle}>{h.title}</Text>
              <Text style={styles.delDesc}>{h.desc}</Text>
            </View>
            <View style={[styles.radio, on && styles.radioOn]}>{on ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}</View>
          </Pressable>
        );
      })}

      {deliveryish ? (
        <>
          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Service radius</Text>
          <View style={styles.chipWrap}>
            {([5, 10] as const).map((mi) => (
              <Pressable
                key={mi}
                pressOpacityFeedback={false}
                onPress={() => updateDraft({ milesPreset: mi })}
                style={[styles.metricChip, draft.milesPreset === mi && styles.metricChipOn]}
              >
                <Text style={[styles.metricChipText, draft.milesPreset === mi && styles.metricChipTextOn]}>{mi} mi</Text>
              </Pressable>
            ))}
            <Pressable
              pressOpacityFeedback={false}
              onPress={() => updateDraft({ milesPreset: 'custom' })}
              style={[styles.metricChip, draft.milesPreset === 'custom' && styles.metricChipOn]}
            >
              <Text style={[styles.metricChipText, draft.milesPreset === 'custom' && styles.metricChipTextOn]}>Custom</Text>
            </Pressable>
          </View>
          {draft.milesPreset === 'custom' ? (
            <TextInput
              value={draft.milesCustom}
              onChangeText={(t) => updateDraft({ milesCustom: t.replace(/\D/g, '').slice(0, 3) })}
              keyboardType="number-pad"
              placeholder="Miles"
              style={styles.input}
              {...numberPadAccessoryProps()}
              onFocus={onNumericFocus}
              onBlur={onNumericBlur}
            />
          ) : null}

          <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Delivery fee (optional)</Text>
          <View style={styles.chipWrap}>
            {(['free', 10, 25] as const).map((f) => (
              <Pressable
                key={String(f)}
                pressOpacityFeedback={false}
                onPress={() => updateDraft({ deliveryFeePreset: f })}
                style={[styles.metricChip, draft.deliveryFeePreset === f && styles.metricChipOn]}
              >
                <Text style={[styles.metricChipText, draft.deliveryFeePreset === f && styles.metricChipTextOn]}>
                  {f === 'free' ? 'Free' : `$${f}`}
                </Text>
              </Pressable>
            ))}
            <Pressable
              pressOpacityFeedback={false}
              onPress={() => updateDraft({ deliveryFeePreset: 'custom' })}
              style={[styles.metricChip, draft.deliveryFeePreset === 'custom' && styles.metricChipOn]}
            >
              <Text style={[styles.metricChipText, draft.deliveryFeePreset === 'custom' && styles.metricChipTextOn]}>Custom</Text>
            </Pressable>
          </View>
          {draft.deliveryFeePreset === 'custom' ? (
            <TextInput
              value={draft.deliveryFeeCustom}
              onChangeText={(t) => updateDraft({ deliveryFeeCustom: sanitizeMoneyDigits(t) })}
              keyboardType="decimal-pad"
              placeholder="Amount"
              style={styles.input}
              {...numberPadAccessoryProps()}
              onFocus={onNumericFocus}
              onBlur={onNumericBlur}
            />
          ) : null}
        </>
      ) : null}

      <Text style={[styles.fieldLabel, { marginTop: 18 }]}>Service area</Text>
      <TextInput
        value={draft.serviceArea}
        onChangeText={(t) => updateDraft({ serviceArea: t })}
        placeholder="Zip, neighborhood, or city"
        style={styles.input}
        onFocus={nudge}
      />
      <Text style={styles.helperMuted}>Exact address is only shared after booking.</Text>
      <Pressable
        pressOpacityFeedback={false}
        disabled={locBusy}
        onPress={async () => {
          setLocBusy(true);
          try {
            await new Promise((r) => setTimeout(r, 120));
            updateDraft({ serviceArea: getApproximateLocationZipForRequest() });
          } finally {
            setLocBusy(false);
          }
        }}
        style={styles.useLoc}
      >
        {locBusy ? <ActivityIndicator /> : <Ionicons name="navigate-circle-outline" size={22} color={ui.primary} />}
        <View style={{ flex: 1 }}>
          <Text style={styles.useLocTitle}>Use current location</Text>
          <Text style={styles.useLocHint}>Approximate area (zip)</Text>
        </View>
      </Pressable>
    </View>
  );
}

/** Step 6 */
export function ListingPricingStepContent({ draft, updateDraft, parentScrollRef }: ListingStepsContentProps) {
  const { onNumericFocus, onNumericBlur } = useListingNumericKeyboardToolbarSync();
  const nudge = useCallback(() => {
    requestAnimationFrame(() => setTimeout(() => parentScrollRef?.current?.scrollToEnd({ animated: true }), 80));
  }, [parentScrollRef]);
  const daily = parseMoneyToNumber(sanitizeMoneyDigits(draft.dailyRate));
  const d3 = daily != null && daily >= 0 ? daily * 3 : null;
  const w1 = daily != null && daily >= 0 ? daily * 7 : null;

  return (
    <View style={styles.pad}>
      <Text style={styles.h1}>Set your daily rate</Text>
      <WizardSubtitle>Choose a competitive price that helps you earn{'\n'}and get booked.</WizardSubtitle>
      <View style={[styles.bigMoney, styles.bigMoneyOn]}>
        <Text style={styles.bigGlyph}>$</Text>
        <TextInput
          value={draft.dailyRate}
          onChangeText={(t) => updateDraft({ dailyRate: sanitizeMoneyDigits(parseDigits(t)) })}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={ui.textSecondary}
          style={styles.bigInput}
          {...numberPadAccessoryProps()}
          onFocus={() => {
            nudge();
            onNumericFocus();
          }}
          onBlur={onNumericBlur}
        />
      </View>
      <Text style={styles.fieldLabel}>Suggested in your area</Text>
      <View style={styles.chipWrap}>
        {SUGGESTED_RATE_CHIPS.map((n) => (
          <Pressable
            key={n}
            onPress={() => updateDraft({ dailyRate: String(n) })}
            style={[styles.metricChip, draft.dailyRate === String(n) && styles.metricChipOn]}
          >
            <Text style={[styles.metricChipText, draft.dailyRate === String(n) && styles.metricChipTextOn]}>${n}</Text>
          </Pressable>
        ))}
      </View>
      {d3 != null ? (
        <View style={styles.previewCard}>
          <Text style={styles.previewLabel}>Earnings preview</Text>
          <View style={styles.previewRow}>
            <Text style={styles.previewLeft}>3 days</Text>
            <Text style={styles.previewRight}>{formatUsd(d3)}</Text>
          </View>
          <View style={styles.previewRow}>
            <Text style={styles.previewLeft}>1 week</Text>
            <Text style={styles.previewRight}>{formatUsd(w1 ?? 0)}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function VerifPhotoRow({
  label,
  slot,
  onPick,
}: {
  label: string;
  slot: ListingPhotoSlot | null;
  onPick: () => void;
}) {
  return (
    <Pressable onPress={onPick} style={styles.verRow}>
      <View style={styles.verThumb}>
        {slot?.localUri ? (
          <Image source={{ uri: slot.remoteUrl ?? slot.localUri }} style={styles.verImg} />
        ) : (
          <Ionicons name="image-outline" size={28} color={ui.textSecondary} />
        )}
        {slot?.uploading ? (
          <View style={styles.verSpin}>
            <ActivityIndicator size="small" />
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.verLabel}>{label}</Text>
        <Text style={styles.verHint}>Tap to add or replace</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={ui.textSecondary} />
    </Pressable>
  );
}

/** Step 7 */
export function ListingProtectionStepContent({ draft, updateDraft }: ListingStepsContentProps) {
  const { onNumericFocus, onNumericBlur } = useListingNumericKeyboardToolbarSync();

  const pickSlot = useCallback(
    async (key: 'verificationSerial' | 'verificationReceipt') => {
      const prev = draft[key];
      const src = await offerWizardPickPhotoSource();
      if (!src) return;
      const uri = src === 'camera' ? await takePhotoFromCamera() : await pickPhotoFromLibrary();
      if (!uri) return;
      updateDraft({ [key]: { localUri: uri, remoteUrl: null, uploading: true } } as Partial<ListingWizardDraft>);
      await uploadSlot(
        uri,
        (remoteUrl) =>
          updateDraft({ [key]: { localUri: uri, remoteUrl, uploading: false } } as Partial<ListingWizardDraft>),
        () => updateDraft({ [key]: prev } as Partial<ListingWizardDraft>)
      );
    },
    [draft, updateDraft]
  );

  return (
    <View style={styles.pad}>
      <Text style={styles.h1}>Protection & verification</Text>
      <WizardSubtitle>
        A few details help renters trust your listing{'\n'}and set fair protection.
      </WizardSubtitle>

      <Text style={styles.fieldLabel}>Estimated market value</Text>
      <View style={[styles.bigMoney, styles.bigMoneyOn]}>
        <Text style={styles.bigGlyph}>$</Text>
        <TextInput
          value={draft.marketValue}
          onChangeText={(t) => updateDraft({ marketValue: sanitizeMoneyDigits(parseDigits(t)) })}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={ui.textSecondary}
          style={styles.bigInput}
          {...numberPadAccessoryProps()}
          onFocus={onNumericFocus}
          onBlur={onNumericBlur}
        />
      </View>

      <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Verification photos</Text>
      <VerifPhotoRow label="Serial / model plate" slot={draft.verificationSerial} onPick={() => void pickSlot('verificationSerial')} />
      <VerifPhotoRow label="Receipt (optional)" slot={draft.verificationReceipt} onPick={() => void pickSlot('verificationReceipt')} />

      <View style={styles.protectCard}>
        <Text style={styles.protectTitle}>How protection works</Text>
        <Text style={styles.protectSectionTitle}>Temporary authorization holds</Text>
        <Text style={styles.protectSectionBody}>
          We may place a temporary hold on the renter&apos;s card during active rentals.
        </Text>
        <Text style={styles.protectSectionTitle}>Verification helps build trust</Text>
        <Text style={styles.protectSectionBody}>
          Photos and serial details help reduce fraud and support disputes if issues happen.
        </Text>
        <Text style={styles.protectSectionTitle}>You stay in control</Text>
        <Text style={styles.protectSectionBody}>
          You approve bookings, pricing, delivery preferences, and availability.
        </Text>
      </View>
    </View>
  );
}

/** Review — storefront-style preview before publish */
export function ListingReviewStepContent({ draft, onEditStep }: ListingStepsContentProps) {
  const hostName = useAuthUserDisplayName();
  const title = effectiveListingTitle(draft);
  const rate = parseMoneyToNumber(sanitizeMoneyDigits(draft.dailyRate));
  const description = buildListingDescription(draft);
  const condLabel = CONDITIONS.find((c) => c.key === draft.condition)?.title;
  const heroUri = draft.coverPhoto?.remoteUrl ?? draft.coverPhoto?.localUri;
  const mv = parseMoneyToNumber(sanitizeMoneyDigits(draft.marketValue));
  const area = draft.serviceArea.trim();

  return (
    <View style={styles.pad}>
      <WizardSubtitle
        textStyle={{ fontSize: 13, lineHeight: 18, color: ui.textSecondary }}
        outerStyle={{ marginBottom: 12 }}
      >
        This is how your listing will look to renters.{'\n'}Tap a section label to refine details before you publish.
      </WizardSubtitle>

      <View style={styles.storeHeroWrap}>
        {heroUri ? (
          <Image source={{ uri: heroUri }} style={styles.storeHeroImg} contentFit="cover" />
        ) : (
          <View style={[styles.storeHeroImg, styles.storeHeroPh]}>
            <Ionicons name="image-outline" size={40} color={ui.textMuted} />
          </View>
        )}
        <Pressable
          onPress={() => onEditStep(1)}
          style={({ pressed }) => [styles.storeHeroEditFab, pressed && { opacity: 0.9 }]}
          hitSlop={8}
        >
          <Ionicons name="camera-outline" size={15} color={ui.primary} />
          <Text style={styles.storeHeroEditFabText}>Photos</Text>
        </Pressable>
      </View>

      <View style={styles.storeBlock}>
        <View style={styles.storeTitleRow}>
          <Text style={styles.storeTitle}>{title || 'Your listing'}</Text>
          <Pressable onPress={() => onEditStep(2)} hitSlop={10}>
            <Text style={styles.storeEditLink}>Edit</Text>
          </Pressable>
        </View>

        {condLabel ? (
          <View style={styles.storeCondRow}>
            <View style={styles.storeCondPill}>
              <Text style={styles.storeCondPillText}>{condLabel}</Text>
            </View>
            <Pressable onPress={() => onEditStep(3)} hitSlop={10}>
              <Text style={styles.storeEditLink}>Edit</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.storePriceRow}>
          <Text style={styles.storePrice}>{rate != null ? `${formatUsd(rate)} / day` : '—'}</Text>
          <Pressable onPress={() => onEditStep(6)} hitSlop={10}>
            <Text style={styles.storeEditLink}>Edit</Text>
          </Pressable>
        </View>

        {area ? <Text style={styles.storeMetaMuted}>Near {area}</Text> : null}

        <View style={styles.storeHostCard}>
          <Text style={styles.storeSectionHeading}>Host</Text>
          <Text style={styles.storeHostName}>{hostName.trim() || 'You'}</Text>
          <Text style={styles.storeHostMeta}>Preview of your renter-facing profile</Text>
        </View>

        <View style={styles.storeSection}>
          <View style={styles.storeSectionHeadRow}>
            <Text style={styles.storeSectionHeading}>What&apos;s included</Text>
            <Pressable onPress={() => onEditStep(4)} hitSlop={10}>
              <Text style={styles.storeEditLink}>{draft.included.length ? 'Edit' : 'Add'}</Text>
            </Pressable>
          </View>
          {draft.included.length > 0 ? (
            <View style={styles.storeChipRow}>
              {draft.included.map((item) => (
                <View key={item} style={styles.storeDetailChip}>
                  <Text style={styles.storeDetailChipText}>{item}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.storePlaceholderLine}>Add batteries, cases, or accessories renters should expect.</Text>
          )}
        </View>

        <View style={styles.storeSection}>
          <View style={styles.storeSectionHeadRow}>
            <Text style={styles.storeSectionHeading}>Pickup / delivery</Text>
            <Pressable onPress={() => onEditStep(5)} hitSlop={10}>
              <Text style={styles.storeEditLink}>Edit</Text>
            </Pressable>
          </View>
          <View style={styles.storeLogisticsCard}>
            <Text style={styles.storeLogisticsPrimary}>{handoffSummaryLine(draft)}</Text>
            {area ? <Text style={styles.storeLogisticsSecondary}>Service area: {area}</Text> : null}
          </View>
        </View>

        <View style={styles.storeSection}>
          <View style={styles.storeSectionHeadRow}>
            <Text style={styles.storeSectionHeading}>About this listing</Text>
            <Pressable onPress={() => onEditStep(2)} hitSlop={10}>
              <Text style={styles.storeEditLink}>Edit</Text>
            </Pressable>
          </View>
          <Text style={styles.storeDescription}>{description.trim() || '—'}</Text>
        </View>

        <View style={styles.storeSection}>
          <View style={styles.storeSectionHeadRow}>
            <Text style={styles.storeSectionHeading}>Trust & verification</Text>
            <Pressable onPress={() => onEditStep(7)} hitSlop={10}>
              <Text style={styles.storeEditLink}>Edit</Text>
            </Pressable>
          </View>
          {mv != null && mv >= 0 ? (
            <Text style={styles.storeTrustLine}>Estimated value {formatUsd(mv)}</Text>
          ) : null}
          <Text style={styles.storeTrustLine}>{verificationStatusLine(draft)}</Text>
        </View>

        <View style={styles.storeProtectionMini}>
          <Text style={styles.storeProtectionMiniTitle}>How protection works</Text>
          <Text style={styles.storeProtectionMiniBody}>
            Temporary holds may apply during active rentals. Verification helps if something goes wrong. You stay in control
            of bookings and pricing.
          </Text>
          <Pressable onPress={() => onEditStep(7)} hitSlop={8} style={styles.storeProtectionEdit}>
            <Text style={styles.storeEditLink}>Edit protection details</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 4 },
  h1: { ...wizardStepTitleStyle },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: ui.textPrimary, marginBottom: 8 },
  helperMuted: { fontSize: 13, color: ui.textMuted, marginTop: 8, lineHeight: 18 },
  charHint: { fontSize: 12, color: ui.textMuted, textAlign: 'right', marginTop: 6 },
  spacer32: { minHeight: 32 },
  captureHeroCard: {
    ...cardChrome,
    marginTop: 6,
    borderRadius: ui.radiusProminent,
    backgroundColor: ui.surfaceTintPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    overflow: 'hidden',
  },
  captureHeroInner: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
  },
  captureHeroTitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: '700',
    color: ui.primary,
    letterSpacing: -0.3,
  },
  captureHeroSub: {
    marginTop: 8,
    fontSize: 13,
    color: ui.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },
  storefrontHeroCard: {
    marginTop: 6,
    borderRadius: ui.radiusProminent,
    overflow: 'hidden',
    backgroundColor: ui.surfaceNeutral,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  storefrontHeroFrame: {
    width: '100%',
    aspectRatio: 4 / 5,
    position: 'relative',
    backgroundColor: ui.surfaceNeutral,
  },
  storefrontHeroImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  storefrontHeroSpinner: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  storefrontHeroEditPill: {
    position: 'absolute',
    right: 12,
    top: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  storefrontHeroEditText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  storefrontThumbRow: { flexDirection: 'row', gap: 10, marginTop: 12, paddingVertical: 4, paddingRight: 4 },
  storefrontThumb: {
    width: 64,
    height: 64,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: ui.border,
    position: 'relative',
    backgroundColor: ui.surfaceNeutral,
  },
  storefrontThumbImg: { width: '100%', height: '100%' },
  storefrontPhotoMeta: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '600',
    color: ui.textSecondary,
    textAlign: 'center',
  },
  includedChipsBelowAdd: { marginTop: 20 },
  thumbSpin: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.2)' },
  countPillMuted: { fontSize: 13, fontWeight: '600', color: ui.textSecondary, textAlign: 'center', marginTop: 14 },
  searchShell: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: ui.radiusInput,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: ui.background,
  },
  searchInput: { flex: 1, fontSize: 16, color: ui.textPrimary, paddingVertical: 4 },
  suggestWrap: { marginTop: 16 },
  suggestPanel: { backgroundColor: MAO_SUGGESTION_BG, borderRadius: 12, overflow: 'hidden' },
  suggestRow: { paddingVertical: 14, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)' },
  suggestTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  suggestSub: { fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 2 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: ui.surfaceNeutral,
  },
  chipText: { fontSize: 14, fontWeight: '600', color: ui.textPrimary },
  incChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: ui.border, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: ui.background },
  input: {
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: ui.radiusButton,
    padding: 14,
    fontSize: 15,
    backgroundColor: ui.surfaceStriped,
    color: ui.text,
  },
  condCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 14,
    padding: 14,
    backgroundColor: ui.background,
  },
  condCardOn: { borderColor: LISTING_PROGRESS_GREEN, backgroundColor: 'rgba(34,197,94,0.06)' },
  condTitle: { fontSize: 17, fontWeight: '700', color: ui.textPrimary },
  condDesc: { fontSize: 13, color: ui.textSecondary, marginTop: 4 },
  radio: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: ui.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: LISTING_PROGRESS_GREEN, backgroundColor: LISTING_PROGRESS_GREEN },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: ui.radiusInput,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  addInput: { flex: 1, fontSize: 15, color: ui.textPrimary, paddingVertical: 6 },
  delCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    backgroundColor: ui.background,
  },
  delCardOn: { borderColor: LISTING_PROGRESS_GREEN, backgroundColor: 'rgba(34,197,94,0.06)' },
  delTitle: { fontSize: 16, fontWeight: '700', color: ui.textPrimary },
  delDesc: { fontSize: 13, color: ui.textSecondary, marginTop: 4 },
  metricChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ui.primary,
    backgroundColor: ui.background,
  },
  metricChipOn: { backgroundColor: ui.primary },
  metricChipText: { fontSize: 14, fontWeight: '700', color: ui.primary },
  metricChipTextOn: { color: ui.primaryOn },
  useLoc: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ui.border,
  },
  useLocTitle: { fontSize: 15, fontWeight: '700', color: ui.textPrimary },
  useLocHint: { fontSize: 12, color: ui.textMuted, marginTop: 2 },
  bigMoney: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: ui.radiusCard,
    paddingVertical: 22,
    marginBottom: 8,
  },
  bigMoneyOn: { borderColor: ui.primary, borderWidth: 2 },
  bigGlyph: { fontSize: 36, fontWeight: '700', color: ui.primary, marginRight: 6 },
  bigInput: { fontSize: 40, fontWeight: '800', color: ui.primary, minWidth: 72, paddingVertical: 4 },
  previewCard: {
    marginTop: 18,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ui.border,
    backgroundColor: ui.surfaceGrouped,
  },
  previewLabel: { fontSize: 12, fontWeight: '800', color: ui.textSecondary, marginBottom: 10 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  previewLeft: { fontSize: 15, fontWeight: '600', color: ui.textPrimary },
  previewRight: { fontSize: 16, fontWeight: '800', color: ui.primary },
  verRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
  },
  verThumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ui.border,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.surfaceNeutral,
  },
  verImg: { width: '100%', height: '100%' },
  verSpin: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.65)' },
  verLabel: { fontSize: 15, fontWeight: '700', color: ui.textPrimary },
  verHint: { fontSize: 12, color: ui.textMuted, marginTop: 2 },
  protectCard: {
    ...wizardTrustCardShell,
  },
  protectTitle: { ...wizardTrustMainTitle },
  protectSectionTitle: { ...wizardTrustSectionTitle },
  protectSectionBody: { ...wizardTrustSectionBody },
  storeHeroWrap: {
    marginHorizontal: -8,
    marginBottom: ui.spaceMd,
    borderRadius: ui.radiusProminent,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: ui.surfaceNeutral,
  },
  storeHeroImg: { width: '100%', height: 280, backgroundColor: ui.surfaceNeutral },
  storeHeroPh: { alignItems: 'center', justifyContent: 'center' },
  storeHeroEditFab: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  storeHeroEditFabText: { fontSize: 13, fontWeight: '700', color: ui.primary },
  storeBlock: { paddingHorizontal: 2 },
  storeTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: ui.spaceSm },
  storeTitle: { flex: 1, fontSize: 22, fontWeight: '700', color: ui.textPrimary, lineHeight: 28 },
  storeEditLink: { fontSize: 14, fontWeight: '700', color: ui.primary, paddingTop: 2 },
  storeCondRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: ui.spaceSm },
  storeCondPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(22, 163, 74, 0.12)',
  },
  storeCondPillText: { fontSize: 14, fontWeight: '700', color: '#16A34A' },
  storePriceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  storePrice: { fontSize: 18, fontWeight: '600', color: ui.textPrimary, flex: 1 },
  storeMetaMuted: { fontSize: 14, color: ui.textSecondary, marginBottom: ui.spaceMd },
  storeHostCard: {
    padding: ui.spaceMd,
    borderRadius: ui.radiusInput,
    backgroundColor: ui.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    marginBottom: ui.spaceLg,
  },
  storeSectionHeading: { fontSize: 15, fontWeight: '700', color: ui.textPrimary },
  storeSectionHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: ui.spaceSm,
  },
  storeSection: { marginBottom: ui.spaceLg },
  storeHostName: { fontSize: 16, fontWeight: '600', color: ui.textPrimary },
  storeHostMeta: { marginTop: 4, fontSize: 14, color: ui.textSecondary },
  storeChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  storeDetailChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: ui.surfaceNeutral,
  },
  storeDetailChipText: { fontSize: 14, fontWeight: '500', color: ui.textPrimary },
  storePlaceholderLine: { fontSize: 14, color: ui.textSecondary, lineHeight: 20 },
  storeLogisticsCard: {
    padding: ui.spaceMd,
    borderRadius: ui.radiusInput,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    backgroundColor: ui.background,
  },
  storeLogisticsPrimary: { fontSize: 16, fontWeight: '600', color: ui.textPrimary },
  storeLogisticsSecondary: { marginTop: 6, fontSize: 14, color: ui.textSecondary },
  storeDescription: { fontSize: 15, color: ui.textPrimary, lineHeight: 22 },
  storeTrustLine: { fontSize: 14, color: ui.textSecondary, marginBottom: 6, lineHeight: 20 },
  storeProtectionMini: {
    marginTop: 4,
    marginBottom: ui.spaceMd,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  storeProtectionMiniTitle: { fontSize: 15, fontWeight: '800', color: ui.textPrimary, marginBottom: 8 },
  storeProtectionMiniBody: { fontSize: 14, color: ui.textSecondary, lineHeight: 20 },
  storeProtectionEdit: { marginTop: 10, alignSelf: 'flex-start' },
});
