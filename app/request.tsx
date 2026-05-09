import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/AppHeaders';
import { KeyboardDismissScreen } from '@/components/KeyboardDismissScreen';
import { numberPadAccessoryProps } from '@/components/NumberPadKeyboardAccessory';
import { Pressable } from '@/components/Pressable';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { primarySolidPressed, subtleControlPressed, ui } from '@/constants/appUi';
import { type HowKey, needsDeliveryFee } from '@/lib/deliveryFormat';
import { type DurationType } from '@/lib/durationFormat';
import { getRequestEditFormValues } from '@/lib/getRequestEditFormValues';
import { calculateDailyLateFee } from '@/lib/dailyLateFee';
import { formatUsd, parseMoneyToNumber, sanitizeMoneyDigits } from '@/lib/money';
import { coordinatesFromLocationField } from '@/lib/zipCoordinates';
import { showFeedbackToast } from '@/store/feedbackToastStore';
import { addRequest, getRequestByTimestamp, updateRequest } from '@/store/requestsStore';

const MAX_DURATION_DAYS = 30;
const RADIUS_OPTIONS = [5, 10, 25, 50] as const;
function formatDateDigits(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function parseMaskedDate(value: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!m) return null;
  const mm = Number(m[1]);
  const dd = Number(m[2]);
  const yyyy = Number(m[3]);
  if (!Number.isFinite(mm) || !Number.isFinite(dd) || !Number.isFinite(yyyy)) return null;
  const d = new Date(yyyy, mm - 1, dd);
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateToMask(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${mm}/${dd}/${yyyy}`;
}

export default function RequestAToolScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    editTimestamp?: string | string[];
    prefillToolName?: string | string[];
    prefillPrice?: string | string[];
  }>();
  const insets = useSafeAreaInsets();

  const [toolName, setToolName] = useState('');
  const [how, setHow] = useState<HowKey | null>(null);
  const [pickupRadiusMiles, setPickupRadiusMiles] = useState('10');
  const [customRadiusMilesInput, setCustomRadiusMilesInput] = useState('');
  const [durationDaysInput, setDurationDaysInput] = useState('');
  const [pickupDateInput, setPickupDateInput] = useState('');
  const [totalPriceInput, setTotalPriceInput] = useState('');
  const [deliveryFeeInput, setDeliveryFeeInput] = useState('');
  const [locationInput, setLocationInput] = useState('');

  const [editingTimestamp, setEditingTimestamp] = useState<number | null>(null);

  const refToolName = useRef<TextInput>(null);
  const refLocation = useRef<TextInput>(null);
  const refDurationDays = useRef<TextInput>(null);
  const refPickupDate = useRef<TextInput>(null);
  const refTotalPrice = useRef<TextInput>(null);
  const refDeliveryFee = useRef<TextInput>(null);

  const focusAfterLocation = useCallback(() => {
    refDurationDays.current?.focus();
  }, []);

  const focusAfterTotal = useCallback(() => {
    if (needsDeliveryFee(how)) {
      refDeliveryFee.current?.focus();
    } else {
      Keyboard.dismiss();
    }
  }, [how]);

  const applyEditFormFromRequest = useCallback(
    (req: NonNullable<ReturnType<typeof getRequestByTimestamp>>) => {
      if (req.timestamp == null) return;
      const v = getRequestEditFormValues(req);
      setToolName(v.toolName);
      setHow(v.how);
      if (RADIUS_OPTIONS.includes(Number(v.pickupRadiusMiles) as (typeof RADIUS_OPTIONS)[number])) {
        setPickupRadiusMiles(v.pickupRadiusMiles);
        setCustomRadiusMilesInput('');
      } else {
        setPickupRadiusMiles('custom');
        setCustomRadiusMilesInput(v.pickupRadiusMiles);
      }
      setPickupDateInput(v.pickupDateInput);
      const reqDuration = Number((req as { durationValue?: unknown }).durationValue);
      if (Number.isFinite(reqDuration) && reqDuration > 0) {
        setDurationDaysInput(String(Math.round(reqDuration)));
      } else {
        const start = parseMaskedDate(v.pickupDateInput);
        const end = parseMaskedDate(v.returnDateInput);
        if (start && end && end.getTime() > start.getTime()) {
          const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
          setDurationDaysInput(String(days));
        } else {
          setDurationDaysInput('');
        }
      }
      setTotalPriceInput(v.totalPriceInput);
      setDeliveryFeeInput(v.deliveryFeeInput);
      setLocationInput(v.locationInput);
      setEditingTimestamp(req.timestamp);
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      const rawEdit = params.editTimestamp;
      const editTsStr = Array.isArray(rawEdit) ? rawEdit[0] : rawEdit;
      if (editTsStr != null && editTsStr !== '') {
        const ts = Number(editTsStr);
        if (Number.isFinite(ts)) {
          const req = getRequestByTimestamp(ts);
          if (req && !req.matched) {
            applyEditFormFromRequest(req);
          }
        }
        router.setParams({ editTimestamp: '' });
        return;
      }

      const rawName = params.prefillToolName;
      const rawPrice = params.prefillPrice;
      const nameStr = Array.isArray(rawName) ? rawName[0] : rawName;
      const priceStr = Array.isArray(rawPrice) ? rawPrice[0] : rawPrice;
      if (nameStr?.trim() || priceStr?.trim()) {
        if (nameStr?.trim()) setToolName(nameStr.trim());
        if (priceStr?.trim()) setTotalPriceInput(sanitizeMoneyDigits(priceStr));
        router.setParams({ prefillToolName: '', prefillPrice: '' });
      }
    }, [
      params.editTimestamp,
      params.prefillToolName,
      params.prefillPrice,
      router,
      applyEditFormFromRequest,
    ])
  );

  const durationDays = Math.max(1, parseInt(durationDaysInput, 10) || 0);
  const pickupDateParsed = parseMaskedDate(pickupDateInput);
  const returnDateParsed =
    pickupDateParsed && Number.isFinite(durationDays) && durationDays > 0
      ? new Date(pickupDateParsed.getTime() + durationDays * 24 * 60 * 60 * 1000)
      : null;
  const returnDateInput = returnDateParsed ? dateToMask(returnDateParsed) : '';
  const durationType: DurationType = durationDays > 1 ? 'multiDay' : 'fullDay';
  const totalPriceNum = parseMoneyToNumber(totalPriceInput);
  const deliveryFeeNumDraft = parseMoneyToNumber(deliveryFeeInput);
  const totalCostForRental = (totalPriceNum ?? 0) + (needsDeliveryFee(how) ? Math.max(0, deliveryFeeNumDraft ?? 0) : 0);
  const derivedDailyRate = totalPriceNum != null && totalPriceNum >= 0 ? totalPriceNum / durationDays : null;
  const derivedDailyLateFee =
    totalPriceNum != null && totalPriceNum >= 0
      ? calculateDailyLateFee({ totalAmount: totalCostForRental, durationDays })
      : null;
  const selectedRadiusMiles =
    pickupRadiusMiles === 'custom' ? parseInt(customRadiusMilesInput, 10) : parseInt(pickupRadiusMiles, 10);
  const isFormFilledForTotal =
    toolName.trim().length > 0 &&
    locationInput.trim().length > 0 &&
    how != null &&
    durationDaysInput.trim().length > 0 &&
    pickupDateParsed != null &&
    totalPriceNum != null &&
    totalPriceNum >= 0 &&
    (!needsDeliveryFee(how) || deliveryFeeNumDraft != null);

  return (
    <ScreenWrapper style={styles.screenWrap}>
      <KeyboardDismissScreen style={styles.screen}>
        <KeyboardAvoidingView
          style={styles.kav}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <ScreenEntrance style={styles.entranceFlex}>
            <BackHeader title="Request Equipment" onBack={() => router.back()} style={styles.requestHeader} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: 12, paddingBottom: 32 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.titleRow}>
          <Text style={styles.title}>What do you need?</Text>
        </View>

      {/* Item name */}
      <View style={styles.section}>
        <Text style={styles.label}>Item name</Text>
        <TextInput
          ref={refToolName}
          placeholder="What equipment do you need?"
          placeholderTextColor={ui.textSecondary}
          value={toolName}
          onChangeText={setToolName}
          style={styles.input}
          returnKeyType="next"
          blurOnSubmit
          onSubmitEditing={() => refLocation.current?.focus()}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Rental Area</Text>
        <TextInput
          ref={refLocation}
          placeholder="e.g. 60614 or Chicago"
          placeholderTextColor={ui.textSecondary}
          value={locationInput}
          onChangeText={setLocationInput}
          style={styles.input}
          autoCapitalize="words"
          returnKeyType="next"
          blurOnSubmit
          onSubmitEditing={focusAfterLocation}
        />
        <Text style={styles.fieldHint}>
          Exact meetup location is shared after both sides agree.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>How far are you willing to rent from?</Text>
        <View style={styles.optionGroup}>
          {RADIUS_OPTIONS.map((miles) => (
            <Pressable
              key={miles}
              pressOpacityFeedback={false}
              style={({ pressed }) => [
                styles.optionButton,
                pickupRadiusMiles === String(miles) && styles.optionSelected,
                pressed &&
                  (pickupRadiusMiles === String(miles) ? styles.optionPressedSelected : styles.optionPressedNeutral),
              ]}
              onPress={() => setPickupRadiusMiles(String(miles))}
            >
              <Text style={[styles.optionText, pickupRadiusMiles === String(miles) && styles.optionTextSelected]}>
                {miles} miles
              </Text>
            </Pressable>
          ))}
          <Pressable
            key="custom"
            pressOpacityFeedback={false}
            style={({ pressed }) => [
              styles.optionButton,
              pickupRadiusMiles === 'custom' && styles.optionSelected,
              pressed && (pickupRadiusMiles === 'custom' ? styles.optionPressedSelected : styles.optionPressedNeutral),
            ]}
            onPress={() => setPickupRadiusMiles('custom')}
          >
            <Text style={[styles.optionText, pickupRadiusMiles === 'custom' && styles.optionTextSelected]}>
              Custom
            </Text>
          </Pressable>
        </View>
        {pickupRadiusMiles === 'custom' ? (
          <TextInput
            placeholder="Enter miles"
            placeholderTextColor={ui.textSecondary}
            value={customRadiusMilesInput}
            onChangeText={(t) => setCustomRadiusMilesInput(t.replace(/\D/g, '').slice(0, 3))}
            style={[styles.input, styles.sectionInputTop]}
            keyboardType="number-pad"
            {...numberPadAccessoryProps()}
          />
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Pickup / Delivery</Text>
        <View style={styles.pickupDeliveryRow}>
          {[
            { key: 'pickup_nearby' as const, label: 'Pickup' },
            { key: 'delivery_only' as const, label: 'Delivery' },
          ].map((opt) => (
            <Pressable
              key={opt.key}
              pressOpacityFeedback={false}
              style={({ pressed }) => [
                styles.pickupDeliveryPill,
                how === opt.key && styles.pickupDeliveryPillSelected,
                pressed && (how === opt.key ? styles.optionPressedSelected : styles.optionPressedNeutral),
              ]}
              onPress={() => setHow(opt.key)}
            >
              <Text style={[styles.pickupDeliveryPillText, how === opt.key && styles.pickupDeliveryPillTextSelected]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>How long would you like to rent?</Text>
        <TextInput
          ref={refDurationDays}
          placeholder="Enter days"
          placeholderTextColor={ui.textSecondary}
          value={durationDaysInput}
          onChangeText={(t) => setDurationDaysInput(t.replace(/\D/g, '').slice(0, 2))}
          style={styles.input}
          keyboardType="number-pad"
          {...numberPadAccessoryProps()}
          returnKeyType="next"
          blurOnSubmit
          onSubmitEditing={() => refPickupDate.current?.focus()}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Pickup Date</Text>
        <Text style={styles.fieldHint}>Exact meetup time will be finalized in chat.</Text>
        <TextInput
          ref={refPickupDate}
          placeholder="MM/DD/YYYY"
          placeholderTextColor={ui.textSecondary}
          value={pickupDateInput}
          onChangeText={(t) => setPickupDateInput(formatDateDigits(t))}
          style={[styles.input, !durationDaysInput.trim() && styles.inputDisabled]}
          keyboardType="number-pad"
          {...numberPadAccessoryProps()}
          maxLength={10}
          returnKeyType="next"
          blurOnSubmit
          onSubmitEditing={() => refTotalPrice.current?.focus()}
          editable={durationDaysInput.trim().length > 0}
          onFocus={() => {
            if (!durationDaysInput.trim()) {
              Alert.alert('Duration required', 'Enter rental duration days before selecting pickup date.');
              refDurationDays.current?.focus();
            }
          }}
        />
        {pickupDateParsed ? (
          <View style={[styles.breakdownBox, styles.returnDateCard]}>
            <Text style={styles.breakdownRow}>
              <Text style={styles.returnDateLabel}>Return Date: </Text>
              {returnDateInput}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Budget</Text>
        <Text style={styles.fieldHint}>
          What are you hoping to pay for the rental?
        </Text>
        <View style={styles.moneyRow}>
          <Text style={styles.dollarPrefix}>$</Text>
          <TextInput
            ref={refTotalPrice}
            placeholder="0"
            placeholderTextColor={ui.textSecondary}
            value={totalPriceInput}
            onChangeText={(t) => setTotalPriceInput(sanitizeMoneyDigits(t))}
            style={styles.moneyInput}
            keyboardType="decimal-pad"
            {...numberPadAccessoryProps()}
            returnKeyType={needsDeliveryFee(how) ? 'next' : 'done'}
            blurOnSubmit
            onSubmitEditing={focusAfterTotal}
          />
        </View>
        {totalPriceNum != null ? (
          <View style={styles.breakdownBox}>
            <Text style={styles.breakdownTitle}>Budget Breakdown</Text>
            <Text style={styles.breakdownRow}>
              ${totalPriceNum.toFixed(2)} over {durationDays} {durationDays === 1 ? 'day' : 'days'}
            </Text>
            <Text style={styles.breakdownRow}>Daily rate: ${(derivedDailyRate ?? 0).toFixed(2)} / day</Text>
            <Text style={styles.breakdownRow}>
              Late-fee daily rate (+20%): ${(derivedDailyLateFee ?? 0).toFixed(2)} / day
            </Text>
          </View>
        ) : null}
        <Text style={styles.softEstimate}>Estimated based on listing rates.</Text>
      </View>

      {needsDeliveryFee(how) && (
        <View style={styles.section}>
          <Text style={styles.label}>Delivery</Text>
          <Text style={styles.fieldHint}>
            Total payment for drop off and pick up.
          </Text>
          <View style={styles.moneyRow}>
            <Text style={styles.dollarPrefix}>$</Text>
            <TextInput
              ref={refDeliveryFee}
              placeholder="0"
              placeholderTextColor={ui.textSecondary}
              value={deliveryFeeInput}
              onChangeText={(t) => setDeliveryFeeInput(sanitizeMoneyDigits(t))}
              style={styles.moneyInput}
              keyboardType="decimal-pad"
              {...numberPadAccessoryProps()}
              returnKeyType="done"
              blurOnSubmit
              onSubmitEditing={() => Keyboard.dismiss()}
            />
          </View>
        </View>
      )}

      {isFormFilledForTotal ? (
        <View style={styles.totalCostRow}>
          <Text style={styles.totalCostLabel}>Total cost for rental</Text>
          <Text style={styles.totalCostValue}>{formatUsd(totalCostForRental)}</Text>
        </View>
      ) : null}

      {/* Submit / Update Button */}
      <Pressable
        pressOpacityFeedback={false}
        haptic
        style={({ pressed }) => [
          styles.submitButton,
          pressed && styles.submitButtonPressed,
        ]}
        onPress={async () => {
          Keyboard.dismiss();
          if (!toolName.trim()) {
            Alert.alert('Missing info', 'Please enter an item name');
            return;
          }
          if (!locationInput.trim()) {
            Alert.alert(
              'Missing info',
              'Please enter your location (zip code or city).'
            );
            return;
          }
          if (!how) {
            Alert.alert('Missing info', 'Please choose a delivery option.');
            return;
          }
          const mi = selectedRadiusMiles;
          if (!Number.isFinite(mi) || mi < 1) {
            Alert.alert('Missing info', 'Choose your rental search radius.');
            return;
          }

          if (!durationDaysInput.trim()) {
            Alert.alert('Missing info', 'Enter rental duration in days.');
            return;
          }
          if (durationDays > MAX_DURATION_DAYS) {
            Alert.alert('Missing info', `Maximum duration is ${MAX_DURATION_DAYS} days.`);
            return;
          }
          if (!pickupDateParsed || !returnDateParsed) {
            Alert.alert('Missing info', 'Enter valid pickup and return dates in MM/DD/YYYY format.');
            return;
          }

          const totalPriceNum = parseMoneyToNumber(totalPriceInput);
          if (totalPriceNum == null || totalPriceNum < 0) {
            Alert.alert(
              'Missing info',
              'Enter the total price for the entire duration.'
            );
            return;
          }

          const pickupMiles =
            how === 'pickup_nearby'
              ? Math.max(1, parseInt(pickupRadiusMiles, 10))
              : null;

          const deliveryFeeNum = needsDeliveryFee(how)
            ? parseMoneyToNumber(deliveryFeeInput) ?? 0
            : null;

          const locTrim = locationInput.trim();
          const geo = coordinatesFromLocationField(locTrim);

          const payload = {
            toolName: toolName.trim(),
            when: pickupDateInput,
            how,
            pickupRadiusMiles: mi,
            durationType,
            durationValue: durationDays,
            totalPrice: totalPriceNum,
            deliveryFee: deliveryFeeNum,
            location: locTrim,
            requestLat: geo?.lat ?? null,
            requestLng: geo?.lng ?? null,
            pickupDate: pickupDateInput,
            returnDate: returnDateInput,
          };

          if (editingTimestamp != null) {
            updateRequest(editingTimestamp, payload);
            setEditingTimestamp(null);
            setToolName('');
            setHow(null);
            setPickupRadiusMiles('10');
            setCustomRadiusMilesInput('');
            setDurationDaysInput('');
            setPickupDateInput('');
            setTotalPriceInput('');
            setDeliveryFeeInput('');
            setLocationInput('');
            showFeedbackToast('Request updated');
            router.back();
            return;
          }
          try {
            await addRequest(payload);
            showFeedbackToast('Request sent');
            router.push('/request-confirmation');
          } catch {
            Alert.alert('Could not save', 'Check your connection and try again.');
          }
        }}
      >
        <Text style={styles.submitText}>
          {editingTimestamp != null ? 'Update Request' : 'Submit Request'}
        </Text>
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
    backgroundColor: ui.background,
  },
  screen: {
    flex: 1,
    backgroundColor: ui.background,
  },
  entranceFlex: {
    flex: 1,
  },
  kav: {
    flex: 1,
  },
  requestHeader: {
    marginBottom: 10,
  },
  container: {
    flex: 1,
    backgroundColor: ui.background,
  },
  scrollContent: {
    paddingHorizontal: 0,
  },
  titleRow: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: ui.textPrimary,
    textAlign: 'center',
  },
  section: {
    marginBottom: 25,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 10,
    color: ui.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: ui.radiusButton,
    padding: 14,
    fontSize: 15,
    backgroundColor: ui.surfaceStriped,
    color: ui.text,
  },
  inputLabel: {
    fontSize: 13,
    color: ui.textPrimary,
    fontWeight: '600',
    marginBottom: 8,
  },
  inputLabelSpaced: {
    marginTop: 12,
  },
  durationSummary: {
    marginTop: 10,
    fontSize: 13,
    color: ui.textSecondary,
    lineHeight: 18,
  },
  fieldHint: {
    fontSize: 13,
    color: ui.textMuted,
    marginBottom: 10,
    lineHeight: 18,
  },
  moneyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: ui.radiusButton,
    backgroundColor: ui.surfaceStriped,
    paddingLeft: 12,
  },
  dollarPrefix: {
    fontSize: 18,
    fontWeight: '600',
    color: ui.textPrimary,
    marginRight: 4,
  },
  moneyInput: {
    flex: 1,
    paddingVertical: 12,
    paddingRight: 12,
    fontSize: 18,
    color: ui.textPrimary,
  },
  optionGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  pickupDeliveryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pickupDeliveryPill: {
    flex: 1,
    borderRadius: ui.radiusButton,
    borderWidth: 1,
    borderColor: ui.border,
    backgroundColor: ui.surfaceNeutral,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickupDeliveryPillSelected: {
    backgroundColor: ui.primary,
    borderColor: ui.primary,
  },
  pickupDeliveryPillText: {
    color: ui.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  pickupDeliveryPillTextSelected: {
    color: ui.primaryOn,
  },
  optionCard: {
    width: '100%',
    borderRadius: ui.radiusButton,
    borderWidth: 1,
    borderColor: ui.border,
    backgroundColor: ui.surfaceNeutral,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  optionCardSelected: {
    backgroundColor: ui.primary,
    borderColor: ui.primary,
  },
  optionCardTitle: {
    color: ui.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  optionCardTitleSelected: {
    color: ui.primaryOn,
  },
  optionCardHint: {
    color: ui.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  optionCardHintSelected: {
    color: 'rgba(255,255,255,0.9)',
  },
  optionButton: {
    minHeight: 50,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: ui.radiusButton,
    backgroundColor: ui.surfaceNeutral,
    marginRight: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: ui.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionSelected: {
    backgroundColor: ui.primary,
    borderColor: ui.primary,
  },
  optionPressedNeutral: {
    ...subtleControlPressed,
  },
  optionPressedSelected: {
    ...primarySolidPressed,
  },
  optionText: {
    color: ui.text,
    fontSize: 14,
    maxWidth: 168,
  },
  optionTextSelected: {
    color: ui.primaryOn,
  },
  softEstimate: {
    marginTop: 8,
    fontSize: 12,
    color: ui.textSecondary,
  },
  inputDisabled: {
    opacity: 0.6,
  },
  sectionInputTop: {
    marginTop: 10,
  },
  readOnlyDateWrap: {
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: ui.radiusButton,
    padding: 14,
    backgroundColor: ui.surfaceNeutral,
  },
  readOnlyDateText: {
    fontSize: 15,
    color: ui.textPrimary,
    fontWeight: '500',
  },
  breakdownBox: {
    marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    paddingVertical: 9,
    paddingHorizontal: 10,
    gap: 2,
  },
  breakdownTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 2,
  },
  breakdownRow: {
    fontSize: 12,
    lineHeight: 17,
    color: ui.textSecondary,
    fontWeight: '500',
  },
  returnDateCard: {
    marginTop: 12,
  },
  returnDateLabel: {
    fontWeight: '700',
    color: ui.textPrimary,
  },
  totalCostRow: {
    marginTop: 4,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalCostLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.textSecondary,
  },
  totalCostValue: {
    fontSize: 18,
    fontWeight: '700',
    color: ui.textPrimary,
  },
  submitButton: {
    marginTop: 20,
    backgroundColor: ui.primary,
    paddingVertical: ui.padButtonV,
    borderRadius: ui.radiusButton,
    alignItems: 'center',
  },
  submitButtonPressed: {
    ...primarySolidPressed,
  },
  submitText: {
    color: ui.primaryOn,
    fontSize: 16,
    fontWeight: '600',
  },
});