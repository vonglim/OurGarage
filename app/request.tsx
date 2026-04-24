import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Pressable } from '@/components/Pressable';
import { ScreenEntrance } from '@/components/ScreenEntrance';
import { ScrollView } from 'react-native-gesture-handler';
import { KeyboardDismissScreen } from '@/components/KeyboardDismissScreen';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { numberPadAccessoryProps } from '@/components/NumberPadKeyboardAccessory';
import { getRequestEditFormValues } from '@/lib/getRequestEditFormValues';
import { showFeedbackToast } from '@/store/feedbackToastStore';
import {
  addRequest,
  getRequestByTimestamp,
  updateRequest,
} from '@/store/requestsStore';
import { DELIVERY_OPTIONS, needsDeliveryFee, type HowKey } from '@/lib/deliveryFormat';
import { DURATION_OPTIONS, type DurationType } from '@/lib/durationFormat';
import { parseMoneyToNumber, sanitizeMoneyDigits } from '@/lib/money';
import { coordinatesFromLocationField } from '@/lib/zipCoordinates';
import { primarySolidPressed, subtleControlPressed, ui } from '@/constants/appUi';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const whenOptions = ['Today', 'This Weekend', 'Flexible'];

export default function RequestAToolScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    editTimestamp?: string | string[];
    prefillToolName?: string | string[];
    prefillPrice?: string | string[];
  }>();
  const insets = useSafeAreaInsets();

  const [toolName, setToolName] = useState('');
  const [when, setWhen] = useState<string | null>(null);
  const [how, setHow] = useState<HowKey | null>(null);
  const [pickupRadiusMiles, setPickupRadiusMiles] = useState('10');
  const [durationType, setDurationType] = useState<DurationType | null>(null);
  const [durationDays, setDurationDays] = useState('');
  const [durationWeeks, setDurationWeeks] = useState('');
  const [totalPriceInput, setTotalPriceInput] = useState('');
  const [deliveryFeeInput, setDeliveryFeeInput] = useState('');
  const [locationInput, setLocationInput] = useState('');

  const [editingTimestamp, setEditingTimestamp] = useState<number | null>(null);

  const refToolName = useRef<TextInput>(null);
  const refLocation = useRef<TextInput>(null);
  const refPickupRadius = useRef<TextInput>(null);
  const refDurationDays = useRef<TextInput>(null);
  const refDurationWeeks = useRef<TextInput>(null);
  const refTotalPrice = useRef<TextInput>(null);
  const refDeliveryFee = useRef<TextInput>(null);

  const focusAfterLocation = useCallback(() => {
    if (how === 'pickup_nearby') {
      refPickupRadius.current?.focus();
    } else if (durationType === 'multiDay') {
      refDurationDays.current?.focus();
    } else if (durationType === 'weekly') {
      refDurationWeeks.current?.focus();
    } else {
      refTotalPrice.current?.focus();
    }
  }, [how, durationType]);

  const focusAfterPickup = useCallback(() => {
    if (durationType === 'multiDay') {
      refDurationDays.current?.focus();
    } else if (durationType === 'weekly') {
      refDurationWeeks.current?.focus();
    } else {
      refTotalPrice.current?.focus();
    }
  }, [durationType]);

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
      setWhen(v.when);
      setHow(v.how);
      setPickupRadiusMiles(v.pickupRadiusMiles);
      setDurationType(v.durationType);
      setDurationDays(v.durationDays);
      setDurationWeeks(v.durationWeeks);
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

  return (
    <ScreenWrapper style={styles.screenWrap}>
      <KeyboardDismissScreen style={styles.screen}>
        <KeyboardAvoidingView
          style={styles.kav}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <ScreenEntrance style={styles.entranceFlex}>
            <View style={[styles.topBar, { paddingTop: 8 }]}>
              <View style={styles.headerTitleBlock}>
                <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backHit}>
                  <Text style={styles.backLabel}>‹ Back</Text>
                </Pressable>
                <Text style={styles.screenTitle}>Request equipment</Text>
              </View>
            </View>
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
        <Text style={styles.label}>Your location (zip code or city)</Text>
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
          Exact location will be shared after match.
        </Text>
      </View>

      {/* When Needed */}
      <View style={styles.section}>
        <Text style={styles.label}>When do you need it?</Text>
        <View style={styles.optionGroup}>
          {whenOptions.map((option) => (
            <Pressable
              key={option}
              pressOpacityFeedback={false}
              style={({ pressed }) => [
                styles.optionButton,
                when === option && styles.optionSelected,
                pressed &&
                  (when === option ? styles.optionPressedSelected : styles.optionPressedNeutral),
              ]}
              onPress={() => setWhen(option)}
            >
              <Text
                style={[
                  styles.optionText,
                  when === option && styles.optionTextSelected,
                ]}
              >
                {option}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Delivery</Text>
        <View style={styles.optionGroup}>
          {DELIVERY_OPTIONS.map(({ key, shortLabel }) => (
            <Pressable
              key={key}
              pressOpacityFeedback={false}
              style={({ pressed }) => [
                styles.optionButton,
                how === key && styles.optionSelected,
                pressed &&
                  (how === key ? styles.optionPressedSelected : styles.optionPressedNeutral),
              ]}
              onPress={() => setHow(key)}
            >
              <Text
                style={[
                  styles.optionText,
                  how === key && styles.optionTextSelected,
                ]}
              >
                {shortLabel}
              </Text>
            </Pressable>
          ))}
        </View>
        {how === 'pickup_nearby' && (
          <TextInput
            ref={refPickupRadius}
            placeholder="Miles (e.g. 10)"
            placeholderTextColor={ui.textSecondary}
            value={pickupRadiusMiles}
            onChangeText={(t) =>
              setPickupRadiusMiles(t.replace(/[^0-9]/g, '').slice(0, 3))
            }
            style={[styles.input, styles.durationDaysInput]}
            keyboardType="number-pad"
            {...numberPadAccessoryProps()}
            returnKeyType="next"
            blurOnSubmit
            onSubmitEditing={focusAfterPickup}
          />
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>How long do you need it?</Text>
        <View style={styles.optionGroup}>
          {DURATION_OPTIONS.map(({ key, label }) => (
            <Pressable
              key={key}
              pressOpacityFeedback={false}
              style={({ pressed }) => [
                styles.optionButton,
                durationType === key && styles.optionSelected,
                pressed &&
                  (durationType === key
                    ? styles.optionPressedSelected
                    : styles.optionPressedNeutral),
              ]}
              onPress={() => {
                setDurationType(key);
                if (key !== 'multiDay') setDurationDays('');
                if (key !== 'weekly') setDurationWeeks('');
              }}
            >
              <Text
                style={[
                  styles.optionText,
                  durationType === key && styles.optionTextSelected,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        {durationType === 'multiDay' && (
          <TextInput
            ref={refDurationDays}
            placeholder="Number of days"
            placeholderTextColor={ui.textSecondary}
            value={durationDays}
            onChangeText={setDurationDays}
            style={[styles.input, styles.durationDaysInput]}
            keyboardType="number-pad"
            {...numberPadAccessoryProps()}
            returnKeyType="next"
            blurOnSubmit
            onSubmitEditing={() => refTotalPrice.current?.focus()}
          />
        )}
        {durationType === 'weekly' && (
          <TextInput
            ref={refDurationWeeks}
            placeholder="Number of weeks"
            placeholderTextColor={ui.textSecondary}
            value={durationWeeks}
            onChangeText={setDurationWeeks}
            style={[styles.input, styles.durationDaysInput]}
            keyboardType="number-pad"
            {...numberPadAccessoryProps()}
            returnKeyType="next"
            blurOnSubmit
            onSubmitEditing={() => refTotalPrice.current?.focus()}
          />
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Total price for entire duration</Text>
        <Text style={styles.fieldHint}>
          One total for the full time you need the item — not a daily rate.
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
      </View>

      {needsDeliveryFee(how) && (
        <View style={styles.section}>
          <Text style={styles.label}>Delivery fee you can pay (total)</Text>
          <Text style={styles.fieldHint}>
            Total for entire duration for delivery help.
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
          if (!durationType) {
            Alert.alert('Missing info', 'Please choose how long you need the item.');
            return;
          }
          if (!how) {
            Alert.alert('Missing info', 'Please choose a delivery option.');
            return;
          }
          if (durationType === 'multiDay') {
            const n = parseInt(durationDays, 10);
            if (!Number.isFinite(n) || n < 1) {
              Alert.alert('Missing info', 'Enter the number of days (1 or more).');
              return;
            }
          }
          if (durationType === 'weekly') {
            const w = parseInt(durationWeeks, 10);
            if (!Number.isFinite(w) || w < 1) {
              Alert.alert('Missing info', 'Enter the number of weeks (1 or more).');
              return;
            }
          }
          if (how === 'pickup_nearby') {
            const mi = parseInt(pickupRadiusMiles, 10);
            if (!Number.isFinite(mi) || mi < 1) {
              Alert.alert('Missing info', 'Enter how many miles count as nearby pickup.');
              return;
            }
          }

          const durationValue =
            durationType === 'multiDay'
              ? Math.max(1, parseInt(durationDays, 10))
              : durationType === 'weekly'
                ? Math.max(1, parseInt(durationWeeks, 10))
                : null;

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
            when,
            how,
            pickupRadiusMiles: pickupMiles,
            durationType,
            durationValue,
            totalPrice: totalPriceNum,
            deliveryFee: deliveryFeeNum,
            location: locTrim,
            requestLat: geo?.lat ?? null,
            requestLng: geo?.lng ?? null,
          };

          if (editingTimestamp != null) {
            updateRequest(editingTimestamp, payload);
            setEditingTimestamp(null);
            setToolName('');
            setWhen(null);
            setHow(null);
            setPickupRadiusMiles('10');
            setDurationType(null);
            setDurationDays('');
            setDurationWeeks('');
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
  topBar: {
    paddingHorizontal: 0,
    paddingBottom: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
    backgroundColor: ui.background,
  },
  headerTitleBlock: {
    marginBottom: 14,
  },
  backHit: {
    alignSelf: 'flex-start',
  },
  backLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: ui.primary,
  },
  screenTitle: {
    marginTop: 8,
    fontSize: 22,
    fontWeight: '700',
    color: ui.textPrimary,
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
  durationDaysInput: {
    marginTop: 12,
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
  },
  optionButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: ui.radiusButton,
    backgroundColor: ui.surfaceNeutral,
    marginRight: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: ui.border,
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