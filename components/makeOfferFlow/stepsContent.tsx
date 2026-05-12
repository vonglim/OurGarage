import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Pressable } from '@/components/Pressable';
import { WizardSubtitle } from '@/components/WizardSubtitle';
import { ui } from '@/constants/appUi';
import { wizardStepTitleStyle } from '@/constants/wizardCopy';
import {
  offerWizardPickPhotoSource,
  pickMultipleOfferPhotos,
  pickPhotoFromLibrary,
  takePhotoFromCamera,
} from '@/lib/makeOfferWizardPickImages';
import { formatUsd } from '@/lib/money';
import { uploadOfferImage } from '@/lib/uploadOfferImage';
import { showFeedbackToast } from '@/store/feedbackToastStore';

import {
  buildRatePreview,
  formatHoldRange,
  resolveDeliveryFee,
  resolveMilesLabel,
} from './calculations';
import { MAO_PROGRESS_GREEN, MAO_SUGGESTION_BG } from './constants';
import { filterBrandSuggestions, SUGGESTED_ACCESSORIES, type BrandSuggestion } from './mockSuggestions';
import type { ConditionOption, WizardDraft, WizardPhotoSlot } from './types';

const PICKUP_VERIFICATION_EXAMPLE = require('@/assets/images/pickup-verification-example.png');

const CONDITIONS: { key: ConditionOption; title: string; desc: string }[] = [
  { key: 'excellent', title: 'Excellent', desc: 'Looks clean with little to no wear' },
  { key: 'good', title: 'Good', desc: 'Light wear that matches normal use' },
  { key: 'fair', title: 'Fair', desc: 'Visible wear but works reliably' },
];

type DraftUpdater = (patch: Partial<WizardDraft> | ((prev: WizardDraft) => WizardDraft)) => void;

export type StepsContentProps = {
  draft: WizardDraft;
  updateDraft: DraftUpdater;
  durationDays: number;
  dateRangeLabel: string;
  /** Parent wizard scroll — Accessories step uses this to nudge content when focusing “Add an item”. */
  parentScrollRef?: React.RefObject<ScrollView | null>;
};

function parseDigits(s: string): string {
  return s.replace(/[^\d.]/g, '');
}

function slotDisplayUri(slot: WizardPhotoSlot): string {
  return slot.remoteUrl ?? slot.localUri;
}

const ITEM_PHOTO_MAX = 5;
const SERIAL_PHOTO_MAX = 2;
const ITEM_STACK_VISIBLE = 3;

/** Step 1 */
export function BrandModelStepContent({
  draft,
  updateDraft,
  searchRef,
}: StepsContentProps & { searchRef: React.RefObject<TextInput | null> }) {
  const q = draft.brandModelQuery.trim();
  const suggestions: BrandSuggestion[] = q.length >= 1 ? filterBrandSuggestions(q, 3) : [];

  const pickSuggestion = (s: BrandSuggestion) => {
    updateDraft({
      brandModelDisplay: s.title,
      brandModelQuery: s.title,
    });
  };

  return (
    <View style={styles.stepPad}>
      <View style={styles.searchShell}>
        <Ionicons name="search" size={20} color={ui.textSecondary} style={styles.searchIcon} />
        <TextInput
          ref={searchRef}
          value={draft.brandModelQuery}
          onChangeText={(t) => updateDraft({ brandModelQuery: t })}
          placeholder="Search brand or model"
          placeholderTextColor={ui.textSecondary}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          blurOnSubmit
          onSubmitEditing={() => Keyboard.dismiss()}
        />
        {draft.brandModelQuery.length > 0 ? (
          <Pressable
            onPress={() => updateDraft({ brandModelQuery: '' })}
            hitSlop={10}
            style={styles.clearHit}
            accessibilityLabel="Clear search"
          >
            <Ionicons name="close-circle" size={20} color={ui.textSecondary} />
          </Pressable>
        ) : null}
        <Ionicons name="barcode-outline" size={22} color={ui.textSecondary} />
      </View>

      {suggestions.length === 0 ? (
        <View style={styles.centerBlock}>
          <Text style={styles.heroQuestion}>
            Share some details,{'\n'}what Brand and Model{'\n'}are we offering?
          </Text>
          <Text style={styles.heroHelper}>
            Type a brand, model, or key details and we&apos;ll help you find the best match.
          </Text>
        </View>
      ) : (
        <View style={styles.suggestWrap}>
          <View style={styles.suggestPanel}>
            {suggestions.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => pickSuggestion(s)}
                style={({ pressed }) => [styles.suggestRow, pressed && { opacity: 0.88 }]}
              >
                <View style={styles.suggestTextCol}>
                  <Text style={styles.suggestTitle}>{s.title}</Text>
                  <Text style={styles.suggestSub}>{s.subtitle}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

/** Step 2 */
export function ConditionStepContent({ draft, updateDraft }: StepsContentProps) {
  return (
    <View style={styles.stepPad}>
      <Text style={styles.centerHeading}>What condition is it in?</Text>
      <WizardSubtitle>
        Normal wear is expected — choose the option{'\n'}that best matches the item today.
      </WizardSubtitle>
      <View style={styles.conditionList}>
        {CONDITIONS.map((c) => {
          const on = draft.condition === c.key;
          return (
            <Pressable
              key={c.key}
              pressOpacityFeedback={false}
              onPress={() => updateDraft({ condition: c.key })}
              style={({ pressed }) => [
                styles.conditionCard,
                on && styles.conditionCardOn,
                pressed && styles.cardPressIn,
              ]}
            >
              <View style={styles.conditionTextCol}>
                <Text style={styles.conditionTitle}>{c.title}</Text>
                <Text style={styles.conditionDesc}>{c.desc}</Text>
              </View>
              <View style={[styles.radioOuter, on && styles.radioOuterOn]}>
                {on ? <Ionicons name="checkmark" size={16} color={ui.primaryOn} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Step 3 */
export function AccessoriesStepContent({ draft, updateDraft, parentScrollRef }: StepsContentProps) {
  const [pendingItem, setPendingItem] = useState('');
  const addInputRef = useRef<TextInput>(null);
  const bumpScrollForAddField = useCallback(() => {
    requestAnimationFrame(() => {
      parentScrollRef?.current?.scrollTo({ y: 160, animated: true });
    });
  }, [parentScrollRef]);

  const add = (label: string) => {
    const t = label.trim();
    if (!t || draft.accessories.includes(t)) return;
    updateDraft((prev) => ({ ...prev, accessories: [...prev.accessories, t] }));
  };
  const remove = (label: string) => {
    updateDraft((prev) => ({
      ...prev,
      accessories: prev.accessories.filter((a) => a !== label),
    }));
  };

  return (
    <View style={styles.stepPad}>
      <Text style={styles.centerHeading}>What&apos;s included?</Text>
      <WizardSubtitle>
        <Text style={styles.optionalWizardSub}>
          Add accessories, attachments, batteries, chargers, cases, or anything else included with the rental.{' '}
          <Text style={styles.optionalParen}>(Optional)</Text>
        </Text>
      </WizardSubtitle>

      <Text style={styles.sectionLabel}>Included items</Text>
      {draft.accessories.length > 0 ? (
        <View style={styles.chipWrap}>
          {draft.accessories.map((a) => (
            <View key={a} style={styles.chip}>
              <Text style={styles.chipText}>{a}</Text>
              <Pressable onPress={() => remove(a)} hitSlop={8} accessibilityLabel={`Remove ${a}`}>
                <Ionicons name="close" size={16} color={ui.textSecondary} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.addRow}>
        <Pressable
          onPress={() => {
            addInputRef.current?.focus();
            bumpScrollForAddField();
          }}
          hitSlop={8}
          accessibilityLabel="Focus add item field"
          style={({ pressed }) => [pressed && { opacity: 0.75 }]}
        >
          <Ionicons name="add-circle-outline" size={22} color={ui.textSecondary} />
        </Pressable>
        <TextInput
          ref={addInputRef}
          value={pendingItem}
          onChangeText={setPendingItem}
          placeholder="Add an item"
          placeholderTextColor={ui.textSecondary}
          style={styles.addInput}
          returnKeyType="done"
          onFocus={bumpScrollForAddField}
          onSubmitEditing={() => {
            add(pendingItem);
            setPendingItem('');
          }}
        />
      </View>

      <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>Suggested</Text>
      <View style={styles.chipWrap}>
        {SUGGESTED_ACCESSORIES.map((s) => (
          <Pressable
            key={s}
            pressOpacityFeedback={false}
            onPress={() => add(s)}
            style={({ pressed }) => [styles.suggestChip, pressed && styles.chipPressIn]}
          >
            <Text style={styles.suggestChipText}>+ {s}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Step 4 */
export function DeliveryStepContent({ draft, updateDraft }: StepsContentProps) {
  const deliverySelected = draft.deliveryMode === 'delivery';

  return (
    <View style={styles.stepPad}>
      <Text style={styles.centerHeading}>How will you handoff the item?</Text>
      <WizardSubtitle>
        Choose how you&apos;ll meet or deliver the item{'\n'}to the renter.
      </WizardSubtitle>

      <Pressable
        pressOpacityFeedback={false}
        onPress={() => updateDraft({ deliveryMode: 'pickup' })}
        style={({ pressed }) => [
          styles.deliveryCard,
          draft.deliveryMode === 'pickup' && styles.deliveryCardOn,
          pressed && styles.cardPressIn,
        ]}
      >
        <View style={styles.deliveryIconCircle}>
          <Ionicons name="location" size={22} color={ui.primary} />
        </View>
        <View style={styles.deliveryTextCol}>
          <Text style={styles.deliveryTitle}>Pickup</Text>
          <Text style={styles.deliveryDesc}>Renter picks up from you</Text>
        </View>
        <View style={[styles.radioOuter, draft.deliveryMode === 'pickup' && styles.radioOuterOn]}>
          {draft.deliveryMode === 'pickup' ? (
            <Ionicons name="checkmark" size={16} color={ui.primaryOn} />
          ) : null}
        </View>
      </Pressable>

      <Pressable
        pressOpacityFeedback={false}
        onPress={() => updateDraft({ deliveryMode: 'delivery' })}
        style={({ pressed }) => [
          styles.deliveryCard,
          deliverySelected && styles.deliveryCardOn,
          pressed && styles.cardPressIn,
        ]}
      >
        <View style={styles.deliveryIconCircle}>
          <Ionicons name="car-outline" size={22} color={ui.primary} />
        </View>
        <View style={styles.deliveryTextCol}>
          <Text style={styles.deliveryTitle}>I&apos;ll handle delivery and pickup</Text>
          <Text style={styles.deliveryDesc}>You&apos;ll deliver the item to the renter</Text>
        </View>
        <View style={[styles.radioOuter, deliverySelected && styles.radioOuterOn]}>
          {deliverySelected ? <Ionicons name="checkmark" size={16} color={ui.primaryOn} /> : null}
        </View>
      </Pressable>

      {deliverySelected ? (
        <View style={styles.deliveryExpand}>
          <Text style={styles.inlineLabel}>How far will you deliver?</Text>
          <View style={styles.chipRow}>
            {([5, 10, 25] as const).map((mi) => (
              <Pressable
                key={mi}
                pressOpacityFeedback={false}
                onPress={() => updateDraft({ milesPreset: mi })}
                style={({ pressed }) => [
                  styles.metricChip,
                  draft.milesPreset === mi && styles.metricChipOn,
                  pressed && styles.chipPressIn,
                ]}
              >
                <Text style={[styles.metricChipText, draft.milesPreset === mi && styles.metricChipTextOn]}>
                  {mi} mi
                </Text>
              </Pressable>
            ))}
            <Pressable
              pressOpacityFeedback={false}
              onPress={() => updateDraft({ milesPreset: 'custom' })}
              style={({ pressed }) => [
                styles.metricChip,
                draft.milesPreset === 'custom' && styles.metricChipOn,
                pressed && styles.chipPressIn,
              ]}
            >
              <Text
                style={[styles.metricChipText, draft.milesPreset === 'custom' && styles.metricChipTextOn]}
              >
                Custom
              </Text>
            </Pressable>
          </View>
          {draft.milesPreset === 'custom' ? (
            <TextInput
              value={draft.milesCustom}
              onChangeText={(t) => updateDraft({ milesCustom: t })}
              placeholder="e.g. 15"
              keyboardType="number-pad"
              style={styles.smallInput}
            />
          ) : null}

          <Text style={[styles.inlineLabel, styles.inlineLabelSpaced]}>Delivery fee</Text>
          <View style={styles.chipRow}>
            <Pressable
              pressOpacityFeedback={false}
              onPress={() => updateDraft({ feePreset: 'free' })}
              style={({ pressed }) => [
                styles.metricChip,
                draft.feePreset === 'free' && styles.metricChipOn,
                pressed && styles.chipPressIn,
              ]}
            >
              <Text style={[styles.metricChipText, draft.feePreset === 'free' && styles.metricChipTextOn]}>
                Free
              </Text>
            </Pressable>
            <Pressable
              pressOpacityFeedback={false}
              onPress={() => updateDraft({ feePreset: 10 })}
              style={({ pressed }) => [
                styles.metricChip,
                draft.feePreset === 10 && styles.metricChipOn,
                pressed && styles.chipPressIn,
              ]}
            >
              <Text style={[styles.metricChipText, draft.feePreset === 10 && styles.metricChipTextOn]}>
                $10
              </Text>
            </Pressable>
            <Pressable
              pressOpacityFeedback={false}
              onPress={() => updateDraft({ feePreset: 25 })}
              style={({ pressed }) => [
                styles.metricChip,
                draft.feePreset === 25 && styles.metricChipOn,
                pressed && styles.chipPressIn,
              ]}
            >
              <Text style={[styles.metricChipText, draft.feePreset === 25 && styles.metricChipTextOn]}>
                $25
              </Text>
            </Pressable>
            <Pressable
              pressOpacityFeedback={false}
              onPress={() => updateDraft({ feePreset: 'custom' })}
              style={({ pressed }) => [
                styles.metricChip,
                draft.feePreset === 'custom' && styles.metricChipOn,
                pressed && styles.chipPressIn,
              ]}
            >
              <Text style={[styles.metricChipText, draft.feePreset === 'custom' && styles.metricChipTextOn]}>
                Custom
              </Text>
            </Pressable>
          </View>
          {draft.feePreset === 'custom' ? (
            <TextInput
              value={draft.feeCustom}
              onChangeText={(t) => updateDraft({ feeCustom: parseDigits(t) })}
              placeholder="Amount"
              keyboardType="decimal-pad"
              style={styles.smallInput}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Step 5 */
export function DailyRateStepContent(props: StepsContentProps) {
  const { draft, updateDraft, durationDays, dateRangeLabel } = props;
  const preview = buildRatePreview(draft, durationDays, dateRangeLabel);
  const suggested = [20, 25, 35];

  return (
    <View style={styles.stepPad}>
      <Text style={styles.centerHeading}>Daily rate</Text>
      <WizardSubtitle textStyle={{ color: ui.primary }}>
        Collecting dust or making money,{'\n'}your choice.
      </WizardSubtitle>

      <View style={styles.bigMoneyCard}>
        <Text style={styles.bigMoneyGlyph}>$</Text>
        <TextInput
          value={draft.dailyRate}
          onChangeText={(t) => updateDraft({ dailyRate: parseDigits(t) })}
          placeholder="0"
          placeholderTextColor={ui.textSecondary}
          keyboardType="decimal-pad"
          style={styles.bigMoneyInput}
        />
      </View>
      <Text style={styles.inputHelper}>Enter the amount you want to charge per day.</Text>

      {preview ? (
        <>
          <Text style={styles.previewLabel}>Offer preview</Text>
          <View style={styles.previewCard}>
            <View style={styles.previewRow}>
              <Ionicons name="calendar-outline" size={18} color={MAO_PROGRESS_GREEN} />
              <Text style={styles.previewMid}>
                Rental duration / {preview.durationLabel}
              </Text>
              <Text style={styles.previewRight}>{preview.dateRangeLabel}</Text>
            </View>
            <View style={styles.previewDivider} />
            <View style={styles.previewRow}>
              <Ionicons name="car-outline" size={18} color="#3B82F6" />
              <Text style={styles.previewMid} numberOfLines={2}>
                Delivery / {preview.deliveryLine}
              </Text>
              <Text style={styles.previewRight}>
                {preview.deliveryFeeAmount > 0 ? `+${formatUsd(preview.deliveryFeeAmount)}` : '—'}
              </Text>
            </View>
            <View style={styles.previewDivider} />
            <View style={styles.previewRow}>
              <Ionicons name="pricetag-outline" size={18} color="#8B5CF6" />
              <Text style={styles.previewMid}>Includes / {preview.includedSummary}</Text>
              <Text style={styles.previewRight}>{preview.includedCount} items</Text>
            </View>
            <View style={styles.previewDivider} />
            <View style={styles.previewRow}>
              <View style={styles.previewIconCircle}>
                <Ionicons name="stats-chart" size={14} color={ui.primaryOn} />
              </View>
              <Text style={styles.previewMidBold}>Renter total (estimated)</Text>
              <Text style={styles.previewRightBold}>{formatUsd(preview.renterTotal)}</Text>
            </View>
            <View style={styles.previewDivider} />
            <View style={styles.previewRow}>
              <Text style={styles.previewMidBold}>Your estimated earnings</Text>
              <Text style={[styles.previewRightBold, { color: MAO_PROGRESS_GREEN }]}>
                {formatUsd(preview.estimatedEarnings)}
              </Text>
            </View>
          </View>
        </>
      ) : null}

      <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>Suggested daily rates</Text>
      <View style={styles.chipRowWrap}>
        {suggested.map((n) => (
          <Pressable
            key={n}
            pressOpacityFeedback={false}
            onPress={() => updateDraft({ dailyRate: String(n) })}
            style={({ pressed }) => [
              styles.rateSuggestChip,
              draft.dailyRate === String(n) && styles.rateSuggestChipOn,
              pressed && styles.chipPressIn,
            ]}
          >
            <Text style={[styles.rateSuggestText, draft.dailyRate === String(n) && styles.rateSuggestTextOn]}>
              {formatUsd(n)} / day
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Step 6 */
export function MarketValueStepContent({ draft, updateDraft }: StepsContentProps) {
  const mv = Number(parseDigits(draft.marketValue)) || 0;
  const hold = mv > 0 ? formatHoldRange(mv) : null;

  return (
    <View style={styles.stepPad}>
      <Text style={[styles.centerHeading, styles.marketTitleLines]}>
        What&apos;s the estimated{'\n'}market value?
      </Text>
      <WizardSubtitle>
        Used to estimate protection coverage if{'\n'}the item is lost or seriously damaged.
      </WizardSubtitle>

      <View style={[styles.bigMoneyCard, styles.bigMoneyCardNavy]}>
        <Text style={[styles.bigMoneyGlyph, styles.bigMoneyGlyphNavy]}>$</Text>
        <TextInput
          value={draft.marketValue}
          onChangeText={(t) => updateDraft({ marketValue: parseDigits(t) })}
          placeholder="0"
          placeholderTextColor={ui.textSecondary}
          keyboardType="decimal-pad"
          style={[styles.bigMoneyInput, styles.bigMoneyInputNavy]}
        />
      </View>
      <Text style={styles.inputHelper}>Enter the current used market value.</Text>

      <View style={styles.protectionCard}>
        <InfoRow
          icon="shield-checkmark"
          iconColor="#7C3AED"
          title="Protection for both sides"
          body="This helps us create a fair authorization hold in case of loss or serious damage."
        />
        <View style={styles.previewDivider} />
        <InfoRow
          icon="lock-closed"
          iconColor="#7C3AED"
          title="Estimated authorization hold"
          body={
            hold ? (
              <Text style={styles.holdRange}>
                {formatUsd(hold.low)} – {formatUsd(hold.high)}
              </Text>
            ) : (
              'Enter a market value to preview.'
            )
          }
          rightIcon="information-circle-outline"
        />
        <View style={styles.previewDivider} />
        <InfoRow
          icon="options-outline"
          iconColor="#7C3AED"
          title="You do not set the hold directly"
          body="The hold is calculated automatically."
          rightIcon="information-circle-outline"
        />
        <View style={styles.previewDivider} />
        <InfoRow
          icon="shield-outline"
          iconColor="#7C3AED"
          title="Helps protect everyone"
          body="It encourages responsible rentals and helps prevent disputes."
          rightIcon="information-circle-outline"
        />
      </View>

      <Pressable
        onPress={() =>
          Alert.alert(
            'Estimating market value',
            'Check recent sold listings for similar items, or use manufacturer recall guides. This is mock copy until search is connected.'
          )
        }
        style={styles.helpLinkWrap}
      >
        <Text style={styles.helpLink}>? Need help estimating?</Text>
      </Pressable>
    </View>
  );
}

function InfoRow({
  icon,
  iconColor,
  title,
  body,
  rightIcon,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  body: React.ReactNode;
  rightIcon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={22} color={iconColor} />
      <View style={styles.infoMid}>
        <Text style={styles.infoTitle}>{title}</Text>
        {typeof body === 'string' ? <Text style={styles.infoBody}>{body}</Text> : body}
      </View>
      {rightIcon ? <Ionicons name={rightIcon} size={20} color={ui.textSecondary} /> : null}
    </View>
  );
}

/** Step 7 */
export function VerificationStepContent({ draft, updateDraft }: StepsContentProps) {
  const uploadVerification = useCallback(
    async (uri: string, previous: WizardPhotoSlot | null) => {
      updateDraft({ verificationPhoto: { localUri: uri, remoteUrl: null, uploading: true } });
      try {
        const remoteUrl = await uploadOfferImage(uri);
        updateDraft({ verificationPhoto: { localUri: uri, remoteUrl, uploading: false } });
      } catch {
        showFeedbackToast('Could not upload. Try again.');
        updateDraft({ verificationPhoto: previous });
      }
    },
    [updateDraft]
  );

  const pickAndUploadVerification = useCallback(async () => {
    const previous = draft.verificationPhoto;
    const src = await offerWizardPickPhotoSource();
    if (!src) return;
    let uri: string | null = null;
    if (src === 'camera') uri = await takePhotoFromCamera();
    else uri = await pickPhotoFromLibrary();
    if (!uri) return;
    await uploadVerification(uri, previous);
  }, [draft.verificationPhoto, uploadVerification]);

  const onVerificationPress = useCallback(() => {
    const slot = draft.verificationPhoto;
    if (slot?.uploading) return;
    if (slot?.remoteUrl) {
      Alert.alert('Verification photo', undefined, [
        { text: 'Replace', onPress: () => void pickAndUploadVerification() },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => updateDraft({ verificationPhoto: null }),
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    void pickAndUploadVerification();
  }, [draft.verificationPhoto, pickAndUploadVerification, updateDraft]);

  const appendItemSlot = useCallback(
    async (uri: string) => {
      updateDraft((p) => ({
        ...p,
        itemPhotos: [...p.itemPhotos, { localUri: uri, remoteUrl: null, uploading: true }],
      }));
      try {
        const remoteUrl = await uploadOfferImage(uri);
        updateDraft((p) => ({
          ...p,
          itemPhotos: p.itemPhotos.map((s, i) =>
            i === p.itemPhotos.length - 1 && s.localUri === uri && s.uploading
              ? { ...s, remoteUrl, uploading: false }
              : s
          ),
        }));
      } catch {
        showFeedbackToast('Could not upload. Try again.');
        updateDraft((p) => {
          const next = [...p.itemPhotos];
          const last = next[next.length - 1];
          if (last?.localUri === uri && last.remoteUrl == null) next.pop();
          return { ...p, itemPhotos: next };
        });
      }
    },
    [updateDraft]
  );

  const runItemAddFlow = useCallback(async () => {
    const remaining = ITEM_PHOTO_MAX - draft.itemPhotos.length;
    if (remaining <= 0) return;
    const src = await offerWizardPickPhotoSource();
    if (!src) return;
    if (src === 'library') {
      const uris = await pickMultipleOfferPhotos(remaining);
      for (const u of uris) {
        await appendItemSlot(u);
      }
      return;
    }
    const u = await takePhotoFromCamera();
    if (u) await appendItemSlot(u);
  }, [appendItemSlot, draft.itemPhotos]);

  const onItemZonePress = useCallback(() => {
    if (draft.itemPhotos.length === 0) {
      void runItemAddFlow();
      return;
    }
    Alert.alert('Item photos', undefined, [
      { text: 'Add photos', onPress: () => void runItemAddFlow() },
      {
        text: 'Clear all',
        style: 'destructive',
        onPress: () => updateDraft({ itemPhotos: [] }),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [draft.itemPhotos, runItemAddFlow, updateDraft]);

  const appendSerialSlot = useCallback(
    async (uri: string) => {
      updateDraft((p) => ({
        ...p,
        serialPhotos: [...p.serialPhotos, { localUri: uri, remoteUrl: null, uploading: true }],
      }));
      try {
        const remoteUrl = await uploadOfferImage(uri);
        updateDraft((p) => ({
          ...p,
          serialPhotos: p.serialPhotos.map((s, i) =>
            i === p.serialPhotos.length - 1 && s.localUri === uri && s.uploading
              ? { ...s, remoteUrl, uploading: false }
              : s
          ),
        }));
      } catch {
        showFeedbackToast('Could not upload. Try again.');
        updateDraft((p) => {
          const next = [...p.serialPhotos];
          const last = next[next.length - 1];
          if (last?.localUri === uri && last.remoteUrl == null) next.pop();
          return { ...p, serialPhotos: next };
        });
      }
    },
    [updateDraft]
  );

  const runSerialAddFlow = useCallback(async () => {
    const remaining = SERIAL_PHOTO_MAX - draft.serialPhotos.length;
    if (remaining <= 0) return;
    const src = await offerWizardPickPhotoSource();
    if (!src) return;
    if (src === 'library') {
      const uris = await pickMultipleOfferPhotos(remaining);
      for (const u of uris) {
        await appendSerialSlot(u);
      }
      return;
    }
    const u = await takePhotoFromCamera();
    if (u) await appendSerialSlot(u);
  }, [appendSerialSlot, draft.serialPhotos]);

  const onSerialZonePress = useCallback(() => {
    if (draft.serialPhotos.length === 0) {
      void runSerialAddFlow();
      return;
    }
    Alert.alert('Serial / model photos', undefined, [
      { text: 'Add photo', onPress: () => void runSerialAddFlow() },
      {
        text: 'Clear all',
        style: 'destructive',
        onPress: () => updateDraft({ serialPhotos: [] }),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [draft.serialPhotos, runSerialAddFlow, updateDraft]);

  const vSlot = draft.verificationPhoto;
  const itemPhotos = draft.itemPhotos;
  const serialPhotos = draft.serialPhotos;

  const itemOverflow = itemPhotos.length > ITEM_STACK_VISIBLE ? itemPhotos.length - ITEM_STACK_VISIBLE : 0;
  const itemStackSlice = itemPhotos.slice(0, ITEM_STACK_VISIBLE);

  return (
    <View style={styles.stepPad}>
      <Text style={styles.centerHeading}>Let&apos;s verify the item</Text>
      <WizardSubtitle>Photos help protect both sides{'\n'}during rentals.</WizardSubtitle>

      <Text style={styles.tierLabel}>Required</Text>
      <View style={[styles.verifyCard, styles.verifyCardPurple]}>
        <View style={styles.verifyLeft}>
          <Ionicons name="shield-checkmark" size={22} color="#7C3AED" />
        </View>
        <View style={styles.verifyMid}>
          <View style={styles.verifyTitleRow}>
            <Text style={styles.verifyTitle}>Verification photo</Text>
            <View style={styles.badgeReq}>
              <Text style={styles.badgeReqText}>REQUIRED</Text>
            </View>
          </View>
          <Text style={styles.verifyDesc}>A photo of the item with your username and today&apos;s date.</Text>
        </View>
        <View style={styles.verifyMediaCol}>
          <Pressable
            pressOpacityFeedback={false}
            onPress={onVerificationPress}
            style={({ pressed }) => [styles.verifyTapTarget, pressed && styles.chipPressIn]}
          >
            {vSlot ? (
              <View style={styles.verifyPreviewWrap}>
                <Image
                  source={{ uri: slotDisplayUri(vSlot) }}
                  style={styles.verifyPreviewImg}
                  contentFit="cover"
                />
                {vSlot.uploading ? (
                  <View style={styles.verifyPreviewSpinner}>
                    <ActivityIndicator color={ui.primary} />
                  </View>
                ) : null}
                {!vSlot.uploading && vSlot.remoteUrl ? (
                  <View style={styles.verifyOkBadge} accessibilityLabel="Uploaded">
                    <Ionicons name="checkmark" size={12} color={ui.primaryOn} />
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={styles.uploadTile}>
                <Ionicons name="add" size={20} color={ui.primary} />
                <Text style={styles.uploadTileText}>Add photo</Text>
              </View>
            )}
          </Pressable>
          {vSlot?.remoteUrl && !vSlot.uploading ? (
            <Pressable
              onPress={() => void pickAndUploadVerification()}
              hitSlop={10}
              style={styles.verifyReplaceLink}
              accessibilityLabel="Replace verification photo"
            >
              <Text style={styles.verifyReplaceLinkText}>Replace</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <Text style={styles.tierLabel}>Recommended</Text>
      <View style={[styles.verifyCard, styles.verifyCardBlue]}>
        <View style={styles.verifyLeft}>
          <Ionicons name="camera-outline" size={22} color="#2563EB" />
        </View>
        <View style={styles.verifyMid}>
          <View style={styles.verifyTitleRow}>
            <Text style={styles.verifyTitle}>Item photos</Text>
            <View style={[styles.badgeReq, styles.badgeRec]}>
              <Text style={[styles.badgeReqText, styles.badgeRecText]}>RECOMMENDED</Text>
            </View>
          </View>
          <Text style={styles.verifyDesc}>Clear photos from different angles so renters know what to expect.</Text>
        </View>
        <Pressable
          pressOpacityFeedback={false}
          onPress={onItemZonePress}
          style={({ pressed }) => [styles.verifyMediaCol, pressed && styles.chipPressIn]}
        >
          {itemPhotos.length === 0 ? (
            <View style={styles.uploadTile}>
              <Ionicons name="add" size={20} color={ui.primary} />
              <Text style={styles.uploadTileText}>Add photos</Text>
            </View>
          ) : (
            <View style={styles.stackTapArea}>
              <View style={styles.stackInner}>
                {itemStackSlice.map((slot, i) => (
                  <View
                    key={`${slot.localUri}-${i}`}
                    style={[
                      styles.stackLayer,
                      {
                        top: i * 4,
                        left: i * 4,
                        zIndex: 10 - i,
                      },
                    ]}
                  >
                    <Image
                      source={{ uri: slotDisplayUri(slot) }}
                      style={styles.stackLayerImg}
                      contentFit="cover"
                    />
                    {slot.uploading ? (
                      <View style={styles.stackLayerSpinner}>
                        <ActivityIndicator color={ui.primary} size="small" />
                      </View>
                    ) : null}
                  </View>
                ))}
                {itemOverflow > 0 ? (
                  <View style={styles.stackOverflowPill} pointerEvents="none">
                    <Text style={styles.stackOverflowText}>+{itemOverflow}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.uploadCountTight}>
                {itemPhotos.filter((p) => p.remoteUrl).length} / {ITEM_PHOTO_MAX}
              </Text>
            </View>
          )}
        </Pressable>
      </View>

      <Text style={styles.tierLabel}>Optional</Text>
      <View style={[styles.verifyCard, styles.verifyCardGreen]}>
        <View style={styles.verifyLeft}>
          <Ionicons name="barcode-outline" size={22} color="#059669" />
        </View>
        <View style={styles.verifyMid}>
          <View style={styles.verifyTitleRow}>
            <Text style={styles.verifyTitle}>Serial / Model (if applicable)</Text>
            <View style={[styles.badgeReq, styles.badgeOpt]}>
              <Text style={[styles.badgeReqText, styles.badgeOptText]}>OPTIONAL</Text>
            </View>
          </View>
          <Text style={styles.verifyDesc}>Helps verify the exact model and prevents mix-ups.</Text>
        </View>
        <Pressable
          pressOpacityFeedback={false}
          onPress={onSerialZonePress}
          style={({ pressed }) => [styles.verifyMediaCol, pressed && styles.chipPressIn]}
        >
          {serialPhotos.length === 0 ? (
            <View style={styles.uploadTile}>
              <Ionicons name="add" size={20} color="#059669" />
              <Text style={styles.uploadTileText}>Add photo</Text>
            </View>
          ) : (
            <View style={styles.stackTapArea}>
              <View style={styles.stackInner}>
                {serialPhotos.map((slot, i) => (
                  <View
                    key={`${slot.localUri}-${i}`}
                    style={[
                      styles.stackLayer,
                      styles.stackLayerSerial,
                      {
                        top: i * 4,
                        left: i * 4,
                        zIndex: 10 - i,
                      },
                    ]}
                  >
                    <Image
                      source={{ uri: slotDisplayUri(slot) }}
                      style={styles.stackLayerImg}
                      contentFit="cover"
                    />
                    {slot.uploading ? (
                      <View style={styles.stackLayerSpinner}>
                        <ActivityIndicator color="#059669" size="small" />
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
              <Text style={styles.uploadCountTight}>
                {serialPhotos.filter((p) => p.remoteUrl).length} / {SERIAL_PHOTO_MAX}
              </Text>
            </View>
          )}
        </Pressable>
      </View>

      <View style={styles.exampleExplain}>
        <View style={styles.exampleExplainHead}>
          <Ionicons name="shield-checkmark" size={18} color="#7C3AED" />
          <Text style={styles.exampleExplainTitle}>Why we need a verification photo</Text>
        </View>
        <Text style={styles.exampleExplainBody}>
          This helps confirm you have the item in your possession and protects both you and the renter.
        </Text>
        <View style={styles.exampleRow}>
          <Image source={PICKUP_VERIFICATION_EXAMPLE} style={styles.exampleImg} contentFit="cover" />
          <View style={styles.checklistCol}>
            <Text style={styles.exampleBadge}>EXAMPLE</Text>
            {['Handwritten username', "Today's date", 'Item clearly visible', 'Helps prevent disputes'].map(
              (line) => (
                <View key={line} style={styles.checkRow}>
                  <Ionicons name="checkmark-circle" size={16} color="#7C3AED" />
                  <Text style={styles.checkText}>{line}</Text>
                </View>
              )
            )}
          </View>
        </View>
      </View>

      <View style={styles.lockNote}>
        <Ionicons name="lock-closed-outline" size={14} color={ui.textSecondary} />
        <Text style={styles.lockNoteText}>Your photos are only used for verification and safety.</Text>
      </View>
    </View>
  );
}

/** Final review */
export function ReviewStepContent({
  draft,
  onEditStep,
  durationDays,
  dateRangeLabel,
}: StepsContentProps & { onEditStep: (step: number) => void }) {
  const rows = buildReviewRows(draft);
  const preview = buildRatePreview(draft, durationDays, dateRangeLabel);

  return (
    <View style={styles.stepPad}>
      <Text style={styles.centerHeading}>Review your offer</Text>
      <WizardSubtitle>
        Confirm details before sending.{'\n'}Tap Edit to jump back.
      </WizardSubtitle>

      <View style={styles.reviewCard}>
        {rows.map((row, i) => (
          <View key={row.label}>
            <View style={styles.reviewRow}>
              <View style={styles.reviewTextCol}>
                <Text style={styles.reviewLabel}>{row.label}</Text>
                <Text style={styles.reviewValue}>{row.value}</Text>
              </View>
              <Pressable onPress={() => onEditStep(i + 1)} style={styles.editBtn}>
                <Text style={styles.editBtnText}>Edit</Text>
              </Pressable>
            </View>
            {i < rows.length - 1 ? <View style={styles.previewDivider} /> : null}
          </View>
        ))}
      </View>

      {preview ? (
        <View style={styles.reviewTotals}>
          <Text style={styles.reviewTotalsLabel}>Estimated totals (mock)</Text>
          <View style={styles.reviewTotalRow}>
            <Text style={styles.reviewTotalLeft}>Renter total</Text>
            <Text style={styles.reviewTotalRight}>{formatUsd(preview.renterTotal)}</Text>
          </View>
          <View style={styles.reviewTotalRow}>
            <Text style={styles.reviewTotalLeft}>Your earnings (est.)</Text>
            <Text style={[styles.reviewTotalRight, { color: MAO_PROGRESS_GREEN }]}>
              {formatUsd(preview.estimatedEarnings)}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Review rows helper */
export function buildReviewRows(draft: WizardDraft): { label: string; value: string }[] {
  const brand =
    draft.brandModelDisplay.trim() || draft.brandModelQuery.trim() || '—';
  const cond = draft.condition
    ? draft.condition.charAt(0).toUpperCase() + draft.condition.slice(1)
    : '—';
  const acc =
    draft.accessories.length > 0 ? draft.accessories.join(', ') : 'Nothing listed';
  let del = 'Pickup';
  if (draft.deliveryMode === 'delivery') {
    const miles = resolveMilesLabel(draft);
    const fee = resolveDeliveryFee(draft);
    del = `Delivery • ${miles} • ${fee > 0 ? formatUsd(fee) : 'Free'}`;
  }
  const daily = draft.dailyRate ? formatUsd(Number(parseDigits(draft.dailyRate))) : '—';
  const mv = draft.marketValue ? formatUsd(Number(parseDigits(draft.marketValue))) : '—';

  return [
    { label: 'Item', value: brand },
    { label: 'Condition', value: cond },
    { label: 'Included', value: acc },
    { label: 'Delivery', value: del },
    { label: 'Daily rate', value: `${daily}/day` },
    { label: 'Market value', value: mv },
    {
      label: 'Photos',
      value: `Verification ${draft.verificationPhoto?.remoteUrl ? '✓' : '—'} · Item ${
        draft.itemPhotos.filter((p) => p.remoteUrl).length
      } · Serial ${draft.serialPhotos.filter((p) => p.remoteUrl).length}`,
    },
  ];
}

const styles = StyleSheet.create({
  stepPad: {
    paddingHorizontal: 4,
  },
  searchShell: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: ui.radiusInput,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: ui.background,
    gap: 8,
  },
  searchIcon: {},
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: ui.textPrimary,
    paddingVertical: 4,
  },
  clearHit: { marginRight: 4 },
  centerBlock: {
    marginTop: 36,
    paddingHorizontal: 8,
  },
  heroQuestion: {
    fontSize: 22,
    fontWeight: '700',
    color: ui.textPrimary,
    textAlign: 'center',
    lineHeight: 30,
  },
  heroHelper: {
    marginTop: 14,
    fontSize: 14,
    color: ui.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  suggestWrap: { marginTop: 20 },
  suggestPanel: {
    backgroundColor: MAO_SUGGESTION_BG,
    borderRadius: 12,
    overflow: 'hidden',
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  suggestTextCol: { flex: 1, paddingRight: 8 },
  suggestTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  suggestSub: { fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 2 },
  centerHeading: {
    ...wizardStepTitleStyle,
  },
  optionalWizardSub: {
    fontSize: 14,
    fontWeight: '400',
    color: ui.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
  /** Step 6 — taller line rhythm for two-line headline */
  marketTitleLines: {
    lineHeight: 28,
  },
  optionalParen: { fontStyle: 'italic' },
  /** Subtle scale on press — pair with `pressOpacityFeedback={false}` on `Pressable`. */
  cardPressIn: {
    transform: [{ scale: 0.985 }],
  },
  chipPressIn: {
    transform: [{ scale: 0.97 }],
  },
  conditionList: { gap: 12 },
  conditionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 14,
    padding: 14,
    backgroundColor: ui.background,
  },
  conditionCardOn: {
    borderColor: MAO_PROGRESS_GREEN,
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
  },
  conditionTextCol: { flex: 1 },
  conditionTitle: { fontSize: 17, fontWeight: '700', color: ui.textPrimary },
  conditionDesc: { fontSize: 13, color: ui.textSecondary, marginTop: 4 },
  radioOuter: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: ui.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterOn: {
    borderColor: MAO_PROGRESS_GREEN,
    backgroundColor: MAO_PROGRESS_GREEN,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 8,
  },
  sectionLabelSpaced: { marginTop: 18 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: ui.background,
  },
  chipText: { fontSize: 14, fontWeight: '600', color: ui.textPrimary },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: ui.radiusInput,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
    minHeight: 48,
  },
  addInput: { flex: 1, fontSize: 15, color: ui.textPrimary, paddingVertical: 6 },
  suggestChip: {
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: ui.background,
  },
  suggestChipText: { fontSize: 14, fontWeight: '600', color: ui.textPrimary },
  deliveryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    backgroundColor: ui.background,
  },
  deliveryCardOn: {
    borderColor: MAO_PROGRESS_GREEN,
    backgroundColor: 'rgba(34, 197, 94, 0.06)',
  },
  deliveryIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  deliveryTextCol: { flex: 1 },
  deliveryTitle: { fontSize: 16, fontWeight: '700', color: ui.textPrimary },
  deliveryDesc: { fontSize: 13, color: ui.textSecondary, marginTop: 4 },
  deliveryExpand: {
    marginTop: 8,
    paddingTop: 8,
  },
  inlineLabel: { fontSize: 13, fontWeight: '700', color: ui.textPrimary },
  inlineLabelSpaced: { marginTop: 16 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chipRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  metricChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ui.primary,
    backgroundColor: ui.background,
  },
  metricChipOn: {
    backgroundColor: ui.primary,
  },
  metricChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.primary,
  },
  metricChipTextOn: {
    color: ui.primaryOn,
  },
  smallInput: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: ui.textPrimary,
    backgroundColor: ui.surfaceInput,
  },
  bigMoneyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: ui.radiusCard,
    paddingVertical: 22,
    paddingHorizontal: 16,
    backgroundColor: ui.background,
  },
  bigMoneyCardNavy: {
    borderColor: ui.primary,
    borderWidth: 2,
  },
  bigMoneyGlyph: {
    fontSize: 36,
    fontWeight: '700',
    color: ui.textSecondary,
    marginRight: 6,
  },
  bigMoneyGlyphNavy: {
    color: ui.primary,
  },
  bigMoneyInput: {
    fontSize: 40,
    fontWeight: '800',
    color: ui.textPrimary,
    minWidth: 80,
    paddingVertical: 4,
  },
  bigMoneyInputNavy: {
    color: ui.primary,
  },
  inputHelper: {
    fontSize: 13,
    color: ui.textSecondary,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: ui.textSecondary,
    letterSpacing: 0.6,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  previewCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ui.border,
    backgroundColor: ui.surfaceGrouped,
    padding: 14,
    gap: 0,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  previewMid: { flex: 1, fontSize: 13, color: ui.textSecondary, fontWeight: '500' },
  previewMidBold: { flex: 1, fontSize: 14, color: ui.textPrimary, fontWeight: '700' },
  previewRight: { fontSize: 13, fontWeight: '600', color: ui.textPrimary },
  previewRightBold: { fontSize: 15, fontWeight: '800', color: ui.textPrimary },
  previewDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: ui.border,
  },
  previewIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: ui.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateSuggestChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ui.primary,
    backgroundColor: ui.background,
  },
  rateSuggestChipOn: {
    backgroundColor: ui.primary,
  },
  rateSuggestText: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.primary,
  },
  rateSuggestTextOn: {
    color: ui.primaryOn,
  },
  protectionCard: {
    marginTop: 8,
    borderRadius: ui.radiusCard,
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.22)',
    backgroundColor: 'rgba(245, 243, 255, 0.85)',
    padding: 14,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
  },
  infoMid: { flex: 1 },
  infoTitle: { fontSize: 14, fontWeight: '700', color: ui.textPrimary },
  infoBody: { fontSize: 12, color: ui.textSecondary, marginTop: 4, lineHeight: 17 },
  holdRange: {
    fontSize: 16,
    fontWeight: '800',
    color: '#7C3AED',
    marginTop: 4,
  },
  helpLinkWrap: {
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 8,
  },
  helpLink: {
    fontSize: 14,
    fontWeight: '700',
    color: '#7C3AED',
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
  },
  tierLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: ui.textPrimary,
    marginTop: 10,
    marginBottom: 6,
  },
  verifyCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    gap: 8,
    marginBottom: 8,
  },
  verifyCardPurple: {
    backgroundColor: 'rgba(124, 58, 237, 0.06)',
    borderColor: 'rgba(124, 58, 237, 0.28)',
  },
  verifyCardBlue: {
    backgroundColor: 'rgba(37, 99, 235, 0.06)',
    borderColor: 'rgba(37, 99, 235, 0.25)',
  },
  verifyCardGreen: {
    backgroundColor: 'rgba(5, 150, 105, 0.06)',
    borderColor: 'rgba(5, 150, 105, 0.28)',
  },
  verifyLeft: { justifyContent: 'flex-start', paddingTop: 2 },
  verifyMid: { flex: 1, minWidth: 0 },
  verifyTitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  verifyTitle: { fontSize: 15, fontWeight: '700', color: ui.textPrimary },
  verifyDesc: { fontSize: 12, color: ui.textSecondary, marginTop: 4, lineHeight: 17 },
  badgeReq: {
    backgroundColor: 'rgba(124, 58, 237, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeReqText: { fontSize: 9, fontWeight: '900', color: '#7C3AED', letterSpacing: 0.4 },
  badgeRec: { backgroundColor: 'rgba(37, 99, 235, 0.15)' },
  badgeRecText: { color: '#2563EB' },
  badgeOpt: { backgroundColor: 'rgba(5, 150, 105, 0.15)' },
  badgeOptText: { color: '#059669' },
  uploadTile: {
    width: 76,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: ui.border,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    backgroundColor: ui.background,
  },
  uploadTileText: { fontSize: 10, fontWeight: '700', color: ui.primary, marginTop: 2 },
  uploadCountTight: {
    fontSize: 10,
    fontWeight: '700',
    color: ui.textSecondary,
    marginTop: 4,
    alignSelf: 'center',
  },
  verifyMediaCol: {
    width: 92,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  verifyTapTarget: {
    alignItems: 'flex-end',
  },
  verifyPreviewWrap: {
    width: 76,
    height: 76,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: ui.border,
    backgroundColor: ui.background,
  },
  verifyPreviewImg: {
    width: 76,
    height: 76,
  },
  verifyPreviewSpinner: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.65)',
  },
  verifyOkBadge: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: MAO_PROGRESS_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyReplaceLink: {
    marginTop: 4,
    paddingVertical: 2,
  },
  verifyReplaceLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.primary,
    textAlign: 'right',
  },
  stackTapArea: {
    alignItems: 'center',
    minWidth: 88,
  },
  stackInner: {
    width: 82,
    height: 74,
    position: 'relative',
    alignSelf: 'flex-end',
  },
  stackLayer: {
    position: 'absolute',
    width: 58,
    height: 58,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: ui.border,
    backgroundColor: ui.background,
  },
  stackLayerSerial: {
    width: 56,
    height: 56,
  },
  stackLayerImg: {
    width: '100%',
    height: '100%',
  },
  stackLayerSpinner: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  stackOverflowPill: {
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 20,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  stackOverflowText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  exampleExplain: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 14,
    padding: 14,
    backgroundColor: ui.background,
  },
  exampleExplainHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  exampleExplainTitle: { fontSize: 15, fontWeight: '700', color: ui.textPrimary },
  exampleExplainBody: {
    fontSize: 13,
    color: ui.textSecondary,
    lineHeight: 19,
    marginTop: 8,
    marginBottom: 12,
  },
  exampleRow: { flexDirection: 'row', gap: 12 },
  exampleImg: {
    width: 120,
    height: 120,
    borderRadius: 10,
    backgroundColor: ui.surfaceNeutral,
  },
  checklistCol: { flex: 1 },
  exampleBadge: {
    fontSize: 10,
    fontWeight: '900',
    color: '#7C3AED',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  checkText: { fontSize: 11, color: ui.textSecondary, flex: 1 },
  lockNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    marginTop: 18,
    paddingHorizontal: 12,
  },
  lockNoteText: { fontSize: 12, color: ui.textSecondary, textAlign: 'center', flex: 1 },
  reviewCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ui.border,
    backgroundColor: ui.background,
    paddingVertical: 4,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    gap: 12,
  },
  reviewTextCol: { flex: 1, minWidth: 0 },
  reviewLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: ui.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  reviewValue: {
    fontSize: 15,
    fontWeight: '600',
    color: ui.textPrimary,
    lineHeight: 21,
  },
  editBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  editBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.primary,
  },
  reviewTotals: {
    marginTop: 20,
    padding: 14,
    borderRadius: 14,
    backgroundColor: ui.surfaceGrouped,
    borderWidth: 1,
    borderColor: ui.border,
  },
  reviewTotalsLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: ui.textSecondary,
    marginBottom: 10,
    letterSpacing: 0.4,
  },
  reviewTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  reviewTotalLeft: { fontSize: 14, fontWeight: '600', color: ui.textPrimary },
  reviewTotalRight: { fontSize: 16, fontWeight: '800', color: ui.textPrimary },
});
