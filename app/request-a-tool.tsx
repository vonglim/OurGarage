import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { KeyboardDismissScreen } from './components/KeyboardDismissScreen';
import { numberPadAccessoryProps } from './components/NumberPadKeyboardAccessory';
import { getRequestEditFormValues } from './lib/getRequestEditFormValues';
import {
  addRequest,
  getRequestByTimestamp,
  updateRequest,
} from './store/requestsStore';
import { DELIVERY_OPTIONS, needsDeliveryFee, type HowKey } from './lib/deliveryFormat';
import { DURATION_OPTIONS, type DurationType } from './lib/durationFormat';
import { parseMoneyToNumber, sanitizeMoneyDigits } from './lib/money';
import { coordinatesFromLocationField } from './lib/zipCoordinates';
import { ui } from '@/constants/appUi';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const whenOptions = ['Today', 'This Weekend', 'Flexible'];

export default function RequestAToolScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ editTimestamp?: string | string[] }>();
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
      const raw = params.editTimestamp;
      const editTsStr = Array.isArray(raw) ? raw[0] : raw;
      if (editTsStr == null || editTsStr === '') return;
      const ts = Number(editTsStr);
      if (!Number.isFinite(ts)) return;
      const req = getRequestByTimestamp(ts);
      if (req && !req.matched) {
        applyEditFormFromRequest(req);
      }
      router.setParams({ editTimestamp: '' });
    }, [params.editTimestamp, router, applyEditFormFromRequest])
  );

  return (
    <KeyboardDismissScreen style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backHit}>
          <Text style={styles.backLabel}>‹ Back</Text>
        </Pressable>
        <Text style={styles.screenTitle}>Request a tool</Text>
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

      {/* Tool Input */}
      <View style={styles.section}>
        <Text style={styles.label}>Tool Name</Text>
        <TextInput
          ref={refToolName}
          placeholder="What tool do you need?"
          placeholderTextColor="#888"
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
          placeholderTextColor="#888"
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
              style={({ pressed }) => [
                styles.optionButton,
                when === option && styles.optionSelected,
                pressed && styles.optionPressed,
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
              style={({ pressed }) => [
                styles.optionButton,
                how === key && styles.optionSelected,
                pressed && styles.optionPressed,
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
            placeholderTextColor="#888"
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
              style={({ pressed }) => [
                styles.optionButton,
                durationType === key && styles.optionSelected,
                pressed && styles.optionPressed,
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
            placeholderTextColor="#888"
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
            placeholderTextColor="#888"
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
          One total for the full time you need the tool — not a daily rate.
        </Text>
        <View style={styles.moneyRow}>
          <Text style={styles.dollarPrefix}>$</Text>
          <TextInput
            ref={refTotalPrice}
            placeholder="0"
            placeholderTextColor="#888"
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
              placeholderTextColor="#888"
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
        style={({ pressed }) => [
          styles.submitButton,
          pressed && styles.submitButtonPressed,
        ]}
        onPress={() => {
          Keyboard.dismiss();
          if (!toolName.trim()) {
            Alert.alert('Missing info', 'Please enter a tool name');
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
            Alert.alert('Missing info', 'Please choose how long you need the tool.');
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
            router.back();
            return;
          }
          addRequest(payload);
          router.push('/request-confirmation');
        }}
      >
        <Text style={styles.submitText}>
          {editingTimestamp != null ? 'Update Request' : 'Submit Request'}
        </Text>
      </Pressable>
      </ScrollView>
      </KeyboardAvoidingView>
    </KeyboardDismissScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  kav: {
    flex: 1,
  },
  topBar: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
  },
  backHit: {
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  backLabel: {
    fontSize: 17,
    fontWeight: '500',
    color: ui.primary,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingHorizontal: 24,
  },
  titleRow: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
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
    backgroundColor: '#F7F7F7',
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
    backgroundColor: '#F7F7F7',
    paddingLeft: 12,
  },
  dollarPrefix: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111',
    marginRight: 4,
  },
  moneyInput: {
    flex: 1,
    paddingVertical: 12,
    paddingRight: 12,
    fontSize: 18,
    color: '#000',
  },
  optionGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  optionButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: ui.radiusButton,
    backgroundColor: '#EEEEEE',
    marginRight: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: ui.border,
  },
  optionSelected: {
    backgroundColor: ui.primary,
    borderColor: ui.primary,
  },
  optionPressed: {
    opacity: ui.pressOpacity,
  },
  optionText: {
    color: ui.text,
    fontSize: 14,
    maxWidth: 168,
  },
  optionTextSelected: {
    color: '#fff',
  },
  submitButton: {
    marginTop: 20,
    backgroundColor: ui.primary,
    paddingVertical: ui.padButtonV,
    borderRadius: ui.radiusButton,
    alignItems: 'center',
  },
  submitButtonPressed: {
    opacity: ui.pressOpacity,
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});