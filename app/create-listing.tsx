import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardDismissScreen } from '@/components/KeyboardDismissScreen';
import { ProtectionSummaryCard } from '@/components/ProtectionSummaryCard';
import { BackHeader } from '@/components/AppHeaders';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { numberPadAccessoryProps } from '@/components/NumberPadKeyboardAccessory';
import { showFeedbackToast } from '@/store/feedbackToastStore';
import { useListingsStore } from '@/store/listingsStore';
import { getAuthUserDisplayName, getAuthUserIdSync } from '@/lib/authUser';
import { Pressable } from '@/components/Pressable';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { primarySolidPressed, ui } from '@/constants/appUi';
import { getCreateListingPricingGuidance } from '@/lib/createListingPricingGuide';
import { parseMoneyToNumber, sanitizeMoneyDigits } from '@/lib/money';
import { calculatePreauthAmount } from '@/lib/rentalProtection';
import {
  mockLateFeeCapInput,
  mockLateFeeInput,
  mockListingDescription,
  mockListingLocation,
  mockListingPriceInput,
  mockListingTitle,
  mockReplacementValueInput,
  useDevPageAutofill,
} from '@/lib/devTools';

import Ionicons from '@expo/vector-icons/Ionicons';

type FieldErrors = {
  title?: string;
  price?: string;
  description?: string;
  location?: string;
  quality?: string;
  replacementValue?: string;
  dailyLateFee?: string;
  maxLateFeeCap?: string;
};

type QualityChecks = {
  clean: boolean;
  functional: boolean;
  photos: boolean;
};

function validate(
  title: string,
  priceRaw: string,
  description: string,
  location: string,
  quality: QualityChecks
): FieldErrors {
  const e: FieldErrors = {};
  const t = title.trim();
  if (t.length < 2) {
    e.title = 'Enter a title (at least 2 characters).';
  }
  const p = parseMoneyToNumber(priceRaw);
  if (p == null || p <= 0) {
    e.price = 'Enter a valid price per day.';
  } else if (p > 99_999) {
    e.price = 'Price is too high.';
  }
  if (description.trim().length < 8) {
    e.description = 'Add a description (at least 8 characters).';
  }
  if (location.trim().length < 2) {
    e.location = 'Enter a neighborhood, city, or zip.';
  }
  if (!quality.clean || !quality.functional || !quality.photos) {
    e.quality = 'Please confirm each item in the checklist.';
  }
  return e;
}

export default function CreateListingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const appendListing = useListingsStore((s) => s.appendListing);

  const [title, setTitle] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [qualityClean, setQualityClean] = useState(false);
  const [qualityFunctional, setQualityFunctional] = useState(false);
  const [qualityPhotos, setQualityPhotos] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [replacementValueInput, setReplacementValueInput] = useState('');
  const [dailyLateFeeInput, setDailyLateFeeInput] = useState('');
  const [maxLateFeeCapInput, setMaxLateFeeCapInput] = useState('');

  const refTitle = useRef<TextInput>(null);
  const refPrice = useRef<TextInput>(null);
  const refDescription = useRef<TextInput>(null);
  const refLocation = useRef<TextInput>(null);

  const pricingGuidance = useMemo(() => getCreateListingPricingGuidance(title), [title]);
  const replacementValue = parseMoneyToNumber(replacementValueInput) ?? 0;
  const dailyLateFee = parseMoneyToNumber(dailyLateFeeInput) ?? 0;
  const maxLateFeeCap = parseMoneyToNumber(maxLateFeeCapInput) ?? 0;

  const clearFieldError = useCallback((key: keyof FieldErrors) => {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const quality: QualityChecks = {
    clean: qualityClean,
    functional: qualityFunctional,
    photos: qualityPhotos,
  };

  const clearQualityError = useCallback(() => {
    setErrors((prev) => {
      if (!prev.quality) return prev;
      const next = { ...prev };
      delete next.quality;
      return next;
    });
  }, []);

  const devAutofillCreateListing = useCallback(() => {
    setTitle(mockListingTitle());
    setPriceInput(mockListingPriceInput());
    setDescription(mockListingDescription());
    setLocation(mockListingLocation());
    setReplacementValueInput(mockReplacementValueInput());
    setDailyLateFeeInput(mockLateFeeInput());
    setMaxLateFeeCapInput(mockLateFeeCapInput());
    setQualityClean(true);
    setQualityFunctional(true);
    setQualityPhotos(true);
    setErrors({});
    showFeedbackToast('Dev: listing form filled');
  }, []);

  useDevPageAutofill(devAutofillCreateListing, { screenLabel: 'Create listing' });

  const onSubmit = () => {
    const next = validate(title, priceInput, description, location, quality);
    if (replacementValue < 0) next.replacementValue = 'Replacement value must be 0 or greater.';
    if (dailyLateFee < 0) next.dailyLateFee = 'Daily late fee must be 0 or greater.';
    if (maxLateFeeCap < 0) next.maxLateFeeCap = 'Max late fee cap must be 0 or greater.';
    if (maxLateFeeCap < dailyLateFee) next.maxLateFeeCap = 'Max late fee cap must be at least the daily late fee.';
    setErrors(next);
    if (Object.keys(next).length > 0) {
      if (next.title) refTitle.current?.focus();
      else if (next.price) refPrice.current?.focus();
      else if (next.description) refDescription.current?.focus();
      else if (next.location) refLocation.current?.focus();
      return;
    }

    const price = parseMoneyToNumber(priceInput)!;
    const id = `listing-${Date.now()}`;
    appendListing({
      id,
      name: title.trim(),
      price,
      priceUnit: 'day',
      description: `${description.trim()}\n\nPickup: ${location.trim()}`,
      ownerName: getAuthUserDisplayName(),
      ownerUserId: getAuthUserIdSync(),
      replacementValue,
      dailyLateFee,
      maxLateFeeCap,
      rating: 5,
      distance: 2.5,
      createdAt: Date.now(),
    });

    Keyboard.dismiss();
    showFeedbackToast('Listing published');
    router.back();
  };

  return (
    <ScreenWrapper style={styles.screenWrap}>
      <KeyboardDismissScreen style={styles.screen}>
        <KeyboardAvoidingView
          style={styles.kav}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <ScreenEntrance style={styles.entranceFlex}>
            <BackHeader title="Create Listing" onBack={() => router.back()} style={styles.createHeader} />
            <Text style={styles.screenSubtitle}>Rent out equipment on Renby</Text>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: 28 + insets.bottom },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.section}>
              <Text style={styles.label}>Photos</Text>
              <Pressable
                pressOpacityFeedback={false}
                onPress={() => showFeedbackToast('Photo upload coming soon')}
                style={({ pressed }) => [styles.photoPlaceholder, pressed && styles.photoPlaceholderPressed]}
              >
                <Ionicons name="image-outline" size={36} color={ui.textSecondary} />
                <Text style={styles.photoPlaceholderTitle}>Add cover photo</Text>
                <Text style={styles.photoPlaceholderHint}>Tap to try (placeholder)</Text>
              </Pressable>
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Protection</Text>
              <View style={[styles.moneyRow, errors.replacementValue && styles.inputInvalid]}>
                <Text style={styles.dollarPrefix}>$</Text>
                <TextInput
                  placeholder="Replacement value"
                  placeholderTextColor={ui.textSecondary}
                  value={replacementValueInput}
                  onChangeText={(v) => {
                    setReplacementValueInput(sanitizeMoneyDigits(v));
                    clearFieldError('replacementValue');
                  }}
                  style={styles.moneyInput}
                  keyboardType="decimal-pad"
                  {...numberPadAccessoryProps()}
                />
              </View>
              {errors.replacementValue ? <Text style={styles.errorText}>{errors.replacementValue}</Text> : null}
              <View style={[styles.moneyRow, errors.dailyLateFee && styles.inputInvalid, styles.inlineTopGap]}>
                <Text style={styles.dollarPrefix}>$</Text>
                <TextInput
                  placeholder="Daily late fee"
                  placeholderTextColor={ui.textSecondary}
                  value={dailyLateFeeInput}
                  onChangeText={(v) => {
                    setDailyLateFeeInput(sanitizeMoneyDigits(v));
                    clearFieldError('dailyLateFee');
                  }}
                  style={styles.moneyInput}
                  keyboardType="decimal-pad"
                  {...numberPadAccessoryProps()}
                />
              </View>
              {errors.dailyLateFee ? <Text style={styles.errorText}>{errors.dailyLateFee}</Text> : null}
              <View style={[styles.moneyRow, errors.maxLateFeeCap && styles.inputInvalid, styles.inlineTopGap]}>
                <Text style={styles.dollarPrefix}>$</Text>
                <TextInput
                  placeholder="Maximum late fee cap"
                  placeholderTextColor={ui.textSecondary}
                  value={maxLateFeeCapInput}
                  onChangeText={(v) => {
                    setMaxLateFeeCapInput(sanitizeMoneyDigits(v));
                    clearFieldError('maxLateFeeCap');
                  }}
                  style={styles.moneyInput}
                  keyboardType="decimal-pad"
                  {...numberPadAccessoryProps()}
                />
              </View>
              {errors.maxLateFeeCap ? <Text style={styles.errorText}>{errors.maxLateFeeCap}</Text> : null}
              <View style={styles.inlineTopGap}>
                <ProtectionSummaryCard
                  replacementValue={replacementValue}
                  dailyLateFee={dailyLateFee}
                  maxLateFeeCap={Math.max(maxLateFeeCap, dailyLateFee)}
                  preauthAmount={calculatePreauthAmount(replacementValue)}
                  compact
                />
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Title</Text>
              <TextInput
                ref={refTitle}
                placeholder="e.g. DeWalt 20V combo kit"
                placeholderTextColor={ui.textSecondary}
                value={title}
                onChangeText={(v) => {
                  setTitle(v);
                  clearFieldError('title');
                }}
                style={[styles.input, errors.title && styles.inputInvalid]}
                returnKeyType="next"
                blurOnSubmit
                onSubmitEditing={() => refPrice.current?.focus()}
              />
              {errors.title ? <Text style={styles.errorText}>{errors.title}</Text> : null}
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Price per day</Text>
              <View style={[styles.moneyRow, errors.price && styles.inputInvalid]}>
                <Text style={styles.dollarPrefix}>$</Text>
                <TextInput
                  ref={refPrice}
                  placeholder="0"
                  placeholderTextColor={ui.textSecondary}
                  value={priceInput}
                  onChangeText={(v) => {
                    setPriceInput(sanitizeMoneyDigits(v));
                    clearFieldError('price');
                  }}
                  style={styles.moneyInput}
                  keyboardType="decimal-pad"
                  {...numberPadAccessoryProps()}
                  returnKeyType="next"
                  blurOnSubmit
                  onSubmitEditing={() => refDescription.current?.focus()}
                />
              </View>
              {errors.price ? <Text style={styles.errorText}>{errors.price}</Text> : null}
              {pricingGuidance ? (
                <View style={styles.priceGuidanceBlock}>
                  <Text style={styles.priceGuidance}>{pricingGuidance.dailyLine}</Text>
                  <Text style={styles.priceGuidanceTenure}>{pricingGuidance.tenureLine}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                ref={refDescription}
                placeholder="Condition, what’s included, pickup notes…"
                placeholderTextColor={ui.textSecondary}
                value={description}
                onChangeText={(v) => {
                  setDescription(v);
                  clearFieldError('description');
                }}
                style={[styles.input, styles.textArea, errors.description && styles.inputInvalid]}
                multiline
                textAlignVertical="top"
                returnKeyType="next"
                blurOnSubmit
                onSubmitEditing={() => refLocation.current?.focus()}
              />
              {errors.description ? (
                <Text style={styles.errorText}>{errors.description}</Text>
              ) : null}
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Location</Text>
              <TextInput
                ref={refLocation}
                placeholder="Neighborhood, city, or zip"
                placeholderTextColor={ui.textSecondary}
                value={location}
                onChangeText={(v) => {
                  setLocation(v);
                  clearFieldError('location');
                }}
                style={[styles.input, errors.location && styles.inputInvalid]}
                autoCapitalize="words"
                returnKeyType="done"
                onSubmitEditing={onSubmit}
              />
              {errors.location ? <Text style={styles.errorText}>{errors.location}</Text> : null}
              <Text style={styles.fieldHint}>Shown to renters after they request.</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Listing quality</Text>
              <View style={styles.qualityCard}>
                <Text style={styles.qualityMessage}>
                  Well-maintained items rent faster and get better reviews
                </Text>
                <Text style={styles.qualitySub}>Confirm before posting:</Text>
                <Pressable
                  pressOpacityFeedback={false}
                  onPress={() => {
                    setQualityClean((v) => !v);
                    clearQualityError();
                  }}
                  style={({ pressed }) => [styles.checkRow, pressed && styles.checkRowPressed]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: qualityClean }}
                >
                  <View style={styles.checkIcon}>
                    <Ionicons
                      name={qualityClean ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={qualityClean ? ui.primary : ui.textSecondary}
                    />
                  </View>
                  <Text style={styles.checkLabel}>Item is clean and maintained</Text>
                </Pressable>
                <Pressable
                  pressOpacityFeedback={false}
                  onPress={() => {
                    setQualityFunctional((v) => !v);
                    clearQualityError();
                  }}
                  style={({ pressed }) => [styles.checkRow, pressed && styles.checkRowPressed]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: qualityFunctional }}
                >
                  <View style={styles.checkIcon}>
                    <Ionicons
                      name={qualityFunctional ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={qualityFunctional ? ui.primary : ui.textSecondary}
                    />
                  </View>
                  <Text style={styles.checkLabel}>Item is fully functional</Text>
                </Pressable>
                <Pressable
                  pressOpacityFeedback={false}
                  onPress={() => {
                    setQualityPhotos((v) => !v);
                    clearQualityError();
                  }}
                  style={({ pressed }) => [styles.checkRow, pressed && styles.checkRowPressed]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: qualityPhotos }}
                >
                  <View style={styles.checkIcon}>
                    <Ionicons
                      name={qualityPhotos ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={qualityPhotos ? ui.primary : ui.textSecondary}
                    />
                  </View>
                  <Text style={styles.checkLabel}>Photos clearly show condition</Text>
                </Pressable>
              </View>
              {errors.quality ? <Text style={styles.errorText}>{errors.quality}</Text> : null}
            </View>

            <Pressable
              pressOpacityFeedback={false}
              haptic
              onPress={onSubmit}
              style={({ pressed }) => [
                styles.submitBtn,
                pressed && styles.submitBtnPressed,
                !(qualityClean && qualityFunctional && qualityPhotos) && styles.submitBtnSoft,
              ]}
            >
              <Text style={styles.submitBtnText}>Publish listing</Text>
            </Pressable>
          </ScrollView>
        </ScreenEntrance>
        </KeyboardAvoidingView>
      </KeyboardDismissScreen>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  screenWrap: {
    backgroundColor: ui.surfaceGrouped,
  },
  screen: {
    flex: 1,
    backgroundColor: ui.surfaceGrouped,
  },
  entranceFlex: {
    flex: 1,
  },
  kav: {
    flex: 1,
  },
  topBar: {
    paddingHorizontal: 0,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
    backgroundColor: ui.surfaceGrouped,
  },
  backHit: {
    marginBottom: 4,
  },
  createHeader: {
    marginBottom: 4,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: ui.textPrimary,
  },
  screenSubtitle: {
    marginTop: 4,
    fontSize: 14,
    color: ui.textSecondary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 0,
    paddingTop: ui.spaceMd,
  },
  section: {
    marginBottom: 22,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: ui.textSecondary,
  },
  photoPlaceholder: {
    flexDirection: 'column',
    alignItems: 'center',
    borderRadius: ui.radiusCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    borderStyle: 'dashed',
    backgroundColor: ui.surfaceInput,
    paddingVertical: 28,
    paddingHorizontal: 16,
  },
  photoPlaceholderPressed: {
    backgroundColor: ui.surfaceStriped,
  },
  photoPlaceholderTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.textPrimary,
    marginTop: 10,
  },
  photoPlaceholderHint: {
    fontSize: 13,
    color: ui.textSecondary,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    borderRadius: ui.radiusInput,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    backgroundColor: ui.background,
    color: ui.textPrimary,
  },
  inputInvalid: {
    borderColor: '#DC2626',
  },
  textArea: {
    minHeight: 120,
    paddingTop: 12,
  },
  moneyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    borderRadius: ui.radiusInput,
    backgroundColor: ui.background,
    paddingLeft: 12,
  },
  dollarPrefix: {
    fontSize: 18,
    fontWeight: '600',
    color: ui.textPrimary,
    marginRight: 2,
  },
  moneyInput: {
    flex: 1,
    paddingVertical: 13,
    paddingRight: 14,
    fontSize: 18,
    color: ui.textPrimary,
  },
  inlineTopGap: {
    marginTop: 10,
  },
  errorText: {
    marginTop: 6,
    fontSize: 13,
    color: '#DC2626',
    lineHeight: 18,
  },
  priceGuidanceBlock: {
    marginTop: 8,
  },
  priceGuidance: {
    fontSize: 13,
    color: ui.textSecondary,
    lineHeight: 18,
  },
  priceGuidanceTenure: {
    marginTop: 4,
    fontSize: 12,
    color: ui.textSecondary,
    lineHeight: 16,
  },
  fieldHint: {
    marginTop: 8,
    fontSize: 13,
    color: ui.textSecondary,
    lineHeight: 18,
  },
  qualityCard: {
    backgroundColor: ui.surfaceInput,
    borderRadius: ui.radiusCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    padding: ui.padCard,
  },
  qualityMessage: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.textPrimary,
    lineHeight: 20,
    marginBottom: 12,
  },
  qualitySub: {
    fontSize: 13,
    fontWeight: '600',
    color: ui.textSecondary,
    marginBottom: 8,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: ui.radiusInput,
  },
  checkRowPressed: {
    backgroundColor: ui.surfaceStriped,
  },
  checkIcon: {
    width: 28,
    alignItems: 'center',
    marginRight: 6,
  },
  checkLabel: {
    flex: 1,
    fontSize: 15,
    color: ui.textPrimary,
    lineHeight: 20,
  },
  submitBtn: {
    marginTop: 8,
    paddingVertical: 15,
    borderRadius: ui.radiusButton,
    backgroundColor: ui.primary,
    alignItems: 'center',
  },
  submitBtnSoft: {
    opacity: 0.55,
  },
  submitBtnPressed: {
    ...primarySolidPressed,
  },
  submitBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: ui.primaryOn,
  },
});
