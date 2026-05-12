import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollView,
} from 'react-native';

import { numberPadAccessoryProps } from '@/components/NumberPadKeyboardAccessory';
import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';
import { formatUsd, parseMoneyToNumber, sanitizeMoneyDigits } from '@/lib/money';
import { getApproximateLocationZipForRequest } from '@/lib/userLocation';

import {
  durationDaysFromDraft,
  effectiveBrandLine,
  formatDateUs,
  resolvePickupRadiusMiles,
  resolveRequestDeliveryFee,
} from './requestCalculations';
import { MAX_DETAILS_CHARS, REQ_PROGRESS_GREEN, REQ_SUGGESTION_BG } from './requestConstants';
import { useRequestNumericKeyboardToolbarSync } from './RequestNumericKeyboardToolbarContext';
import { filterRequestItemSuggestions, type RequestItemSuggestion } from './requestMockSuggestions';
import type { RequestDurationPreset, RequestWizardDraft } from './requestTypes';

const DURATION_CHIPS: { key: RequestDurationPreset; label: string }[] = [
  { key: '1', label: '1 day' },
  { key: 'weekend', label: 'Weekend' },
  { key: '3', label: '3 days' },
  { key: 'week', label: '1 week' },
  { key: 'custom', label: 'Custom' },
];

const DETAIL_SUGGESTIONS = [
  'Need specific accessories',
  'Brand preference',
  'First time using this item',
  'Other',
] as const;

type DraftUpdater = (patch: Partial<RequestWizardDraft> | ((prev: RequestWizardDraft) => RequestWizardDraft)) => void;

export type RequestStepsContentProps = {
  draft: RequestWizardDraft;
  updateDraft: DraftUpdater;
  searchRef: React.RefObject<TextInput | null>;
  onEditStep: (step: 1 | 2 | 3 | 4 | 5) => void;
  /** Parent scroll — nudge pickup/delivery area above keyboard when focusing location. */
  parentScrollRef?: React.RefObject<ScrollView | null>;
};

function parseDigits(s: string): string {
  return s.replace(/[^\d.]/g, '');
}

function returnDateFromDraft(draft: RequestWizardDraft): Date | null {
  if (!draft.startDate) return null;
  const days = durationDaysFromDraft(draft);
  if (days < 1) return null;
  const pickupLocal = new Date(draft.startDate);
  pickupLocal.setHours(0, 0, 0, 0);
  return new Date(pickupLocal.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Step 1 */
export function RequestItemSearchStepContent({ draft, updateDraft, searchRef }: RequestStepsContentProps) {
  const q = draft.brandModelQuery.trim();
  const suggestions: RequestItemSuggestion[] = q.length >= 1 ? filterRequestItemSuggestions(q, 3) : [];

  const pickSuggestion = (s: RequestItemSuggestion) => {
    updateDraft({
      brandModelDisplay: s.title,
      brandModelQuery: s.title,
    });
    Keyboard.dismiss();
  };

  return (
    <View style={styles.stepPad}>
      <Text style={styles.centerHeading}>What are you looking to rent?</Text>
      <Text style={styles.centerSub}>
        Search for a brand, model, or type of item and we&apos;ll help you find the best match.
      </Text>

      <View style={styles.searchShell}>
        <Ionicons name="search" size={20} color={ui.textSecondary} style={styles.searchIcon} />
        <TextInput
          ref={searchRef}
          value={draft.brandModelQuery}
          onChangeText={(t) => updateDraft({ brandModelQuery: t, brandModelDisplay: '' })}
          placeholder="Search brand or model"
          placeholderTextColor={ui.textSecondary}
          style={styles.searchInput}
          autoCapitalize="sentences"
          autoCorrect
          returnKeyType="search"
          blurOnSubmit
          onSubmitEditing={() => Keyboard.dismiss()}
        />
        {draft.brandModelQuery.length > 0 ? (
          <Pressable
            onPress={() => updateDraft({ brandModelQuery: '', brandModelDisplay: '' })}
            hitSlop={10}
            style={styles.clearHit}
            accessibilityLabel="Clear search"
          >
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
      ) : (
        <View style={styles.step1BelowSearchSpacer} />
      )}
    </View>
  );
}

/** Step 2 */
export function RequestScheduleStepContent({ draft, updateDraft }: RequestStepsContentProps) {
  const [iosPickerOpen, setIosPickerOpen] = useState(false);
  const [iosPicked, setIosPicked] = useState<Date>(() => draft.startDate ?? new Date());
  const [androidShow, setAndroidShow] = useState(false);
  const ret = returnDateFromDraft(draft);
  const { onNumericFocus, onNumericBlur } = useRequestNumericKeyboardToolbarSync();

  useEffect(() => {
    if (iosPickerOpen) setIosPicked(draft.startDate ?? new Date());
  }, [iosPickerOpen, draft.startDate]);

  return (
    <View style={styles.stepPad}>
      <Text style={styles.centerHeading}>When do you need it?</Text>
      <Text style={styles.centerSub}>Add your start date and how long you&apos;ll need the item.</Text>

      <Text style={styles.fieldLabel}>Start date</Text>
      <Pressable
        pressOpacityFeedback={false}
        onPress={() => {
          Keyboard.dismiss();
          if (Platform.OS === 'ios') setIosPickerOpen(true);
          else setAndroidShow(true);
        }}
        style={({ pressed }) => [styles.dateRow, pressed && { opacity: 0.92 }]}
      >
        <Ionicons name="calendar-outline" size={22} color={ui.primary} />
        <Text style={[styles.dateRowText, !draft.startDate && styles.dateRowPlaceholder]}>
          {draft.startDate ? formatDateUs(draft.startDate) : 'Select date'}
        </Text>
        <Ionicons name="chevron-forward" size={20} color={ui.textSecondary} />
      </Pressable>

      {Platform.OS === 'android' && androidShow ? (
        <DateTimePicker
          value={draft.startDate ?? new Date()}
          mode="date"
          display="default"
          onChange={(e, d) => {
            setAndroidShow(false);
            if (e.type === 'set' && d) updateDraft({ startDate: d });
          }}
        />
      ) : null}

      {Platform.OS === 'ios' ? (
        <Modal transparent visible={iosPickerOpen} animationType="fade">
          <Pressable style={styles.modalBackdrop} onPress={() => setIosPickerOpen(false)}>
            <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
              <DateTimePicker
                value={iosPicked}
                mode="date"
                display="spinner"
                themeVariant="light"
                onChange={(_, d) => {
                  if (d) setIosPicked(d);
                }}
              />
              <Pressable
                onPress={() => {
                  updateDraft({ startDate: iosPicked });
                  setIosPickerOpen(false);
                }}
                style={({ pressed }) => [styles.doneChip, pressed && { opacity: 0.9 }]}
              >
                <Text style={styles.doneChipText}>Done</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Rental duration</Text>
      <View style={styles.chipRowWrap}>
        {DURATION_CHIPS.map(({ key, label }) => {
          const on = draft.durationPreset === key;
          return (
            <Pressable
              key={String(key)}
              pressOpacityFeedback={false}
              onPress={() => updateDraft({ durationPreset: key })}
              style={({ pressed }) => [
                styles.metricChip,
                on && styles.metricChipOn,
                pressed && styles.chipPressIn,
              ]}
            >
              <Text style={[styles.metricChipText, on && styles.metricChipTextOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      {draft.durationPreset === 'custom' ? (
        <TextInput
          value={draft.durationCustomDays}
          onChangeText={(t) => updateDraft({ durationCustomDays: t.replace(/\D/g, '').slice(0, 2) })}
          placeholder="Days (1–30)"
          placeholderTextColor={ui.textSecondary}
          keyboardType="number-pad"
          style={styles.smallInput}
          {...numberPadAccessoryProps()}
          onFocus={onNumericFocus}
          onBlur={onNumericBlur}
        />
      ) : null}

      {draft.startDate && ret && durationDaysFromDraft(draft) >= 1 ? (
        <View style={styles.dateSummary}>
          <Ionicons name="arrow-forward-circle-outline" size={18} color={REQ_PROGRESS_GREEN} />
          <Text style={styles.dateSummaryText}>
            Return by <Text style={styles.dateSummaryBold}>{formatDateUs(ret)}</Text>
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Step 3 */
export function RequestDeliveryStepContent({ draft, updateDraft, parentScrollRef }: RequestStepsContentProps) {
  const deliverySelected = draft.deliveryMode === 'delivery';
  const [useLocBusy, setUseLocBusy] = useState(false);
  const { onNumericFocus, onNumericBlur } = useRequestNumericKeyboardToolbarSync();

  const nudgeLocationIntoView = useCallback(() => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        parentScrollRef?.current?.scrollToEnd({ animated: true });
      }, 80);
    });
  }, [parentScrollRef]);

  const onUseCurrentLocation = useCallback(async () => {
    if (useLocBusy) return;
    setUseLocBusy(true);
    try {
      await new Promise<void>((r) => setTimeout(r, 120));
      updateDraft({ location: getApproximateLocationZipForRequest() });
    } finally {
      setUseLocBusy(false);
    }
  }, [updateDraft, useLocBusy]);

  return (
    <View style={styles.stepPad}>
      <Text style={styles.centerHeading}>How would you like to get it?</Text>
      <Text style={styles.centerSub}>Choose pickup or delivery and your delivery preferences.</Text>

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
          <Text style={styles.deliveryTitle}>Pickup nearby</Text>
          <Text style={styles.deliveryDesc}>I&apos;ll pick it up from the owner.</Text>
        </View>
        <View style={[styles.radioOuter, draft.deliveryMode === 'pickup' && styles.radioOuterOn]}>
          {draft.deliveryMode === 'pickup' ? <Ionicons name="checkmark" size={16} color={ui.primaryOn} /> : null}
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
          <Text style={styles.deliveryTitle}>Delivery preferred</Text>
          <Text style={styles.deliveryDesc}>Have it delivered to me.</Text>
        </View>
        <View style={[styles.radioOuter, deliverySelected && styles.radioOuterOn]}>
          {deliverySelected ? <Ionicons name="checkmark" size={16} color={ui.primaryOn} /> : null}
        </View>
      </Pressable>

      {deliverySelected ? (
        <View style={styles.deliveryExpand}>
          <Text style={styles.inlineLabel}>Delivery distance</Text>
          <View style={styles.chipRow}>
            {([5, 10] as const).map((mi) => (
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
              <Text style={[styles.metricChipText, draft.milesPreset === 'custom' && styles.metricChipTextOn]}>
                Custom
              </Text>
            </Pressable>
          </View>
          {draft.milesPreset === 'custom' ? (
            <TextInput
              value={draft.milesCustom}
              onChangeText={(t) => updateDraft({ milesCustom: t.replace(/\D/g, '').slice(0, 3) })}
              placeholder="Miles"
              placeholderTextColor={ui.textSecondary}
              keyboardType="number-pad"
              style={styles.smallInput}
              {...numberPadAccessoryProps()}
              onFocus={onNumericFocus}
              onBlur={onNumericBlur}
            />
          ) : null}

          <Text style={[styles.inlineLabel, styles.inlineLabelSpaced]}>Max delivery fee</Text>
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
              <Text style={[styles.metricChipText, draft.feePreset === 'free' && styles.metricChipTextOn]}>Free</Text>
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
              <Text style={[styles.metricChipText, draft.feePreset === 10 && styles.metricChipTextOn]}>$10</Text>
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
              <Text style={[styles.metricChipText, draft.feePreset === 25 && styles.metricChipTextOn]}>$25</Text>
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
              onChangeText={(t) => updateDraft({ feeCustom: sanitizeMoneyDigits(t) })}
              placeholder="Amount"
              placeholderTextColor={ui.textSecondary}
              keyboardType="decimal-pad"
              style={styles.smallInput}
              {...numberPadAccessoryProps()}
              onFocus={onNumericFocus}
              onBlur={onNumericBlur}
            />
          ) : null}
        </View>
      ) : null}

      <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Pickup or delivery area</Text>
      <TextInput
        value={draft.location}
        onChangeText={(t) => updateDraft({ location: t })}
        placeholder="Zip, neighborhood, or city"
        placeholderTextColor={ui.textSecondary}
        style={styles.locationInput}
        autoCapitalize="words"
        returnKeyType="done"
        blurOnSubmit
        onSubmitEditing={() => Keyboard.dismiss()}
        onFocus={nudgeLocationIntoView}
      />
      <Text style={styles.fieldHint}>Exact address is only shared after both sides agree.</Text>

      <Pressable
        pressOpacityFeedback={false}
        onPress={() => void onUseCurrentLocation()}
        disabled={useLocBusy}
        style={({ pressed }) => [styles.useLocationRow, pressed && { opacity: 0.88 }, useLocBusy && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel="Use approximate current location"
      >
        {useLocBusy ? (
          <ActivityIndicator size="small" color={ui.primary} style={{ width: 22 }} />
        ) : (
          <Ionicons name="navigate-circle-outline" size={22} color={ui.primary} />
        )}
        <View style={styles.useLocationTextCol}>
          <Text style={styles.useLocationText}>Use current location</Text>
          <Text style={styles.useLocationHint}>Approximate area (zip)</Text>
        </View>
      </Pressable>
    </View>
  );
}

/** Step 4 */
export function RequestBudgetStepContent({ draft, updateDraft, parentScrollRef }: RequestStepsContentProps) {
  const days = durationDaysFromDraft(draft);
  const totalNum = parseMoneyToNumber(sanitizeMoneyDigits(draft.budget));
  const daily =
    totalNum != null && totalNum >= 0 && days >= 1 ? totalNum / days : null;

  const { onNumericFocus, onNumericBlur } = useRequestNumericKeyboardToolbarSync();

  const nudgeIntoView = useCallback(() => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        parentScrollRef?.current?.scrollToEnd({ animated: true });
      }, 80);
    });
  }, [parentScrollRef]);

  return (
    <View style={styles.stepPad}>
      <Text style={styles.centerHeading}>What&apos;s your estimated budget?</Text>
      <Text style={styles.centerSubTight}>
        <Text style={styles.centerSubLine}>This helps owners see if their item</Text>
        {'\n'}
        <Text style={styles.centerSubLine}>fits your project budget.</Text>
      </Text>

      <View style={[styles.bigMoneyCard, styles.bigMoneyCardNavy]}>
        <Text style={[styles.bigMoneyGlyph, styles.bigMoneyGlyphNavy]}>$</Text>
        <TextInput
          value={draft.budget}
          onChangeText={(t) => updateDraft({ budget: sanitizeMoneyDigits(parseDigits(t)) })}
          placeholder="0"
          placeholderTextColor={ui.textSecondary}
          keyboardType="decimal-pad"
          style={[styles.bigMoneyInput, styles.bigMoneyInputNavy]}
          {...numberPadAccessoryProps()}
          onFocus={() => {
            nudgeIntoView();
            onNumericFocus();
          }}
          onBlur={onNumericBlur}
        />
      </View>
      <Text style={styles.inputHelper}>Enter your estimated total budget.</Text>
      <Text style={styles.budgetReassurance}>We&apos;ll break down the daily rate.</Text>

      {daily != null ? (
        <View style={styles.budgetPreviewCard}>
          <Text style={styles.budgetPreviewLabel}>Estimated daily rate</Text>
          <Text style={styles.budgetPreviewValue}>
            {formatUsd(daily)}
            <Text style={styles.budgetPreviewSuffix}>
              {' '}
              / day · {days} {days === 1 ? 'day' : 'days'}
            </Text>
          </Text>
        </View>
      ) : null}

      <View style={styles.infoCard}>
        <Ionicons name="cash-outline" size={22} color={ui.textSecondary} />
        <Text style={styles.infoCardText}>
          This isn&apos;t a set price.{'\n'}Owners may have different rates or minimums.
        </Text>
      </View>
    </View>
  );
}

/** Step 5 */
export function RequestDetailsStepContent({ draft, updateDraft, parentScrollRef }: RequestStepsContentProps) {
  const len = draft.details.length;
  const append = (snippet: string) => {
    updateDraft((prev) => {
      const cur = prev.details.trim();
      const next = cur.length === 0 ? snippet : `${cur}\n${snippet}`;
      return { ...prev, details: next.slice(0, MAX_DETAILS_CHARS) };
    });
  };

  const nudgeIntoView = useCallback(() => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        parentScrollRef?.current?.scrollToEnd({ animated: true });
      }, 80);
    });
  }, [parentScrollRef]);

  return (
    <View style={styles.stepPad}>
      <Text style={styles.centerHeading}>Anything else owners should know?</Text>
      <Text style={styles.centerSub}>
        Add any details about your project, required accessories, or preferences.{' '}
        <Text style={styles.optionalParen}>(Optional)</Text>
      </Text>

      <View style={styles.textAreaShell}>
        <TextInput
          value={draft.details}
          onChangeText={(t) => updateDraft({ details: t.slice(0, MAX_DETAILS_CHARS) })}
          placeholder="Add details..."
          placeholderTextColor={ui.textSecondary}
          multiline
          textAlignVertical="top"
          style={styles.textArea}
          onFocus={nudgeIntoView}
        />
        <Text style={styles.charCount}>
          {len}/{MAX_DETAILS_CHARS}
        </Text>
      </View>

      <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Suggested details</Text>
      <View style={styles.chipRowWrap}>
        {DETAIL_SUGGESTIONS.map((label) => (
          <Pressable
            key={label}
            pressOpacityFeedback={false}
            onPress={() => append(label)}
            style={({ pressed }) => [styles.popularChip, pressed && styles.chipPressIn]}
          >
            <Text style={styles.popularChipText}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function deliverySummaryLine(draft: RequestWizardDraft): string {
  if (draft.deliveryMode === 'pickup') {
    return `Pickup • within ${resolvePickupRadiusMiles(draft)} mi`;
  }
  const mi = resolvePickupRadiusMiles(draft);
  const fee = resolveRequestDeliveryFee(draft);
  const feeLabel = fee <= 0 ? 'Free delivery' : `Up to ${formatUsd(fee)} delivery`;
  return `Delivery • within ${mi} mi • ${feeLabel}`;
}

/** Review */
export function RequestReviewStepContent({ draft, onEditStep }: RequestStepsContentProps) {
  const item = effectiveBrandLine(draft) || '—';
  const dates =
    draft.startDate && durationDaysFromDraft(draft) >= 1
      ? `${formatDateUs(draft.startDate)} → ${formatDateUs(returnDateFromDraft(draft)!)} (${durationDaysFromDraft(
          draft
        )} ${durationDaysFromDraft(draft) === 1 ? 'day' : 'days'})`
      : '—';
  const delivery = deliverySummaryLine(draft);
  const n = parseMoneyToNumber(sanitizeMoneyDigits(draft.budget));
  const budget = n != null && n >= 0 ? formatUsd(n) : '—';
  const details = draft.details.trim() || '—';

  const rows: { key: string; label: string; value: string; step: 1 | 2 | 3 | 4 | 5 }[] = [
    { key: 'item', label: 'Item', value: item, step: 1 },
    { key: 'dates', label: 'Dates', value: dates, step: 2 },
    { key: 'del', label: 'Delivery', value: delivery, step: 3 },
    { key: 'bud', label: 'Budget', value: budget, step: 4 },
    { key: 'det', label: 'Details', value: details, step: 5 },
  ];

  return (
    <View style={styles.stepPad}>
      <View style={styles.reviewCard}>
        {rows.map((r) => (
          <View key={r.key} style={styles.reviewRow}>
            <View style={styles.reviewTextCol}>
              <Text style={styles.reviewLabel}>{r.label}</Text>
              <Text style={styles.reviewValue}>{r.value}</Text>
            </View>
            <Pressable onPress={() => onEditStep(r.step)} style={styles.editBtn} hitSlop={8}>
              <Text style={styles.editBtnText}>Edit</Text>
            </Pressable>
          </View>
        ))}
      </View>

      <View style={styles.nextCard}>
        <Text style={styles.nextCardTitle}>What happens next?</Text>
        <View style={styles.bulletRow}>
          <Text style={styles.bullet}>•</Text>
          <Text style={styles.bulletText}>Owners in your area will see your request.</Text>
        </View>
        <View style={styles.bulletRow}>
          <Text style={styles.bullet}>•</Text>
          <Text style={styles.bulletText}>They can send you offers that match.</Text>
        </View>
        <View style={styles.bulletRow}>
          <Text style={styles.bullet}>•</Text>
          <Text style={styles.bulletText}>You can review and choose what works best.</Text>
        </View>
      </View>

      <View style={styles.lockNote}>
        <Ionicons name="lock-closed-outline" size={16} color={ui.textSecondary} />
        <Text style={styles.lockNoteText}>You can edit or delete your request anytime.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stepPad: { paddingHorizontal: 4 },
  centerHeading: {
    fontSize: 22,
    fontWeight: '700',
    color: ui.textPrimary,
    textAlign: 'center',
    marginBottom: 10,
  },
  centerSub: {
    fontSize: 14,
    color: ui.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 22,
    paddingHorizontal: 8,
  },
  centerSubTight: {
    fontSize: 14,
    color: ui.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
    paddingHorizontal: 12,
  },
  centerSubLine: {
    color: ui.textSecondary,
  },
  step1BelowSearchSpacer: {
    minHeight: 32,
  },
  optionalParen: { fontStyle: 'italic' },
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
  searchInput: { flex: 1, fontSize: 16, color: ui.textPrimary, paddingVertical: 4 },
  clearHit: { marginRight: 4 },
  suggestWrap: { marginTop: 20 },
  suggestPanel: {
    backgroundColor: REQ_SUGGESTION_BG,
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
  popularBlock: { marginTop: 28 },
  popularLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: ui.textSecondary,
    marginBottom: 12,
  },
  chipRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  popularChip: {
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: ui.surfaceNeutral,
  },
  popularChipText: { fontSize: 14, fontWeight: '600', color: ui.textPrimary },
  chipPressIn: { transform: [{ scale: 0.97 }] },
  cardPressIn: { transform: [{ scale: 0.985 }] },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: ui.textPrimary, marginBottom: 8 },
  fieldLabelSpaced: { marginTop: 18 },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: ui.background,
  },
  dateRowText: { flex: 1, fontSize: 16, fontWeight: '600', color: ui.textPrimary },
  dateRowPlaceholder: { color: ui.textSecondary, fontWeight: '500' },
  dateSummary: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.25)',
  },
  dateSummaryText: { flex: 1, fontSize: 14, color: ui.textSecondary },
  dateSummaryBold: { fontWeight: '700', color: ui.textPrimary },
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    paddingBottom: 24,
  },
  modalCard: {
    marginHorizontal: 12,
    backgroundColor: ui.background,
    borderRadius: 16,
    paddingBottom: 12,
    overflow: 'hidden',
  },
  doneChip: {
    alignSelf: 'center',
    marginTop: 4,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 999,
    backgroundColor: ui.primary,
  },
  doneChipText: { color: ui.primaryOn, fontWeight: '800', fontSize: 15 },
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
    borderColor: REQ_PROGRESS_GREEN,
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
  deliveryExpand: { marginTop: 4, paddingTop: 4 },
  inlineLabel: { fontSize: 13, fontWeight: '700', color: ui.textPrimary },
  inlineLabelSpaced: { marginTop: 16 },
  radioOuter: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: ui.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterOn: { borderColor: REQ_PROGRESS_GREEN, backgroundColor: REQ_PROGRESS_GREEN },
  locationInput: {
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: ui.radiusButton,
    padding: 14,
    fontSize: 15,
    backgroundColor: ui.surfaceStriped,
    color: ui.text,
  },
  fieldHint: {
    fontSize: 13,
    color: ui.textMuted,
    marginTop: 8,
    lineHeight: 18,
  },
  useLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ui.border,
    backgroundColor: ui.background,
  },
  useLocationTextCol: { flex: 1, minWidth: 0 },
  useLocationText: { fontSize: 15, fontWeight: '700', color: ui.textPrimary },
  useLocationHint: { fontSize: 12, color: ui.textMuted, marginTop: 2 },
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
  bigMoneyCardNavy: { borderColor: ui.primary, borderWidth: 2 },
  bigMoneyGlyph: { fontSize: 36, fontWeight: '700', color: ui.textSecondary, marginRight: 6 },
  bigMoneyGlyphNavy: { color: ui.primary },
  bigMoneyInput: {
    fontSize: 40,
    fontWeight: '800',
    color: ui.textPrimary,
    minWidth: 80,
    paddingVertical: 4,
  },
  bigMoneyInputNavy: { color: ui.primary },
  inputHelper: {
    fontSize: 13,
    color: ui.textSecondary,
    textAlign: 'center',
    marginTop: 10,
  },
  budgetReassurance: {
    fontSize: 13,
    color: ui.textMuted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  budgetPreviewCard: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ui.border,
    backgroundColor: ui.surfaceGrouped,
  },
  budgetPreviewLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: ui.textSecondary,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  budgetPreviewValue: {
    fontSize: 20,
    fontWeight: '800',
    color: ui.primary,
  },
  budgetPreviewSuffix: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.textSecondary,
  },
  infoCard: {
    marginTop: 22,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: ui.surfaceGrouped,
    borderWidth: 1,
    borderColor: ui.border,
    alignItems: 'flex-start',
  },
  infoCardText: { flex: 1, fontSize: 14, color: ui.textSecondary, lineHeight: 20 },
  textAreaShell: {
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 14,
    backgroundColor: ui.background,
    minHeight: 160,
    padding: 12,
  },
  textArea: { fontSize: 15, color: ui.textPrimary, minHeight: 120 },
  charCount: {
    alignSelf: 'flex-end',
    fontSize: 12,
    color: ui.textMuted,
    marginTop: 4,
  },
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
  reviewValue: { fontSize: 15, fontWeight: '600', color: ui.textPrimary, lineHeight: 21 },
  editBtn: { paddingVertical: 6, paddingHorizontal: 10 },
  editBtnText: { fontSize: 14, fontWeight: '700', color: ui.primary },
  nextCard: {
    marginTop: 18,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: ui.border,
  },
  nextCardTitle: { fontSize: 15, fontWeight: '800', color: ui.textPrimary, marginBottom: 10 },
  bulletRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  bullet: { fontSize: 14, color: ui.textSecondary, width: 12 },
  bulletText: { flex: 1, fontSize: 14, color: ui.textSecondary, lineHeight: 20 },
  lockNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    marginTop: 22,
    paddingHorizontal: 12,
  },
  lockNoteText: { fontSize: 12, color: ui.textSecondary, textAlign: 'center', flex: 1 },
});
