import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ScrollView, Swipeable } from 'react-native-gesture-handler';
import {
  RequestListCardInner,
  requestListCardSurface,
} from '../components/RequestListCardInner';
import { countOffersForRequest, removeOffersForRequest } from '../store/offersStore';
import {
  addRequest,
  getRequests,
  removeRequest,
  updateRequest,
} from '../store/requestsStore';
import {
  DELIVERY_OPTIONS,
  isHowKey,
  needsDeliveryFee,
  type HowKey,
} from '../lib/deliveryFormat';
import {
  DURATION_OPTIONS,
  type DurationType,
  isDurationType,
} from '../lib/durationFormat';
import {
  getNumericTotalPrice,
  parseMoneyToNumber,
  sanitizeMoneyDigits,
} from '../lib/money';
import { coordinatesFromLocationField } from '../lib/zipCoordinates';
import { ui } from '@/constants/appUi';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProfileNavButton } from '../components/ProfileNavButton';

const whenOptions = ['Today', 'This Weekend', 'Flexible'];

function formatOffersReceived(n: number): string {
  if (n === 1) return '1 offer received';
  return `${n} offers received`;
}

function getTimeAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(diffMs / (60 * 1000));
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

export default function Requests() {
  const router = useRouter();
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

  const [requests, setRequests] = useState<any[]>([]);
  const [editingTimestamp, setEditingTimestamp] = useState<number | null>(null);
  const swipeRefs = useRef(new Map<number, Swipeable>());

  // Refresh requests on focus (ensure newest first)
  useFocusEffect(
    useCallback(() => {
      const reqs = getRequests();
      // Already sorted by getRequests (newest first), but let's ensure it
      setRequests(reqs.sort((a, b) => b.timestamp - a.timestamp));
    }, [])
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingTop: 24 + insets.top, paddingBottom: 40 + insets.bottom },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.titleRow}>
        <View style={styles.titleSide} />
        <Text style={styles.title}>Request A Tool</Text>
        <View style={[styles.titleSide, styles.titleSideRight]}>
          <ProfileNavButton />
        </View>
      </View>

      {/* Tool Input */}
      <View style={styles.section}>
        <Text style={styles.label}>Tool Name</Text>
        <TextInput
          placeholder="What tool do you need?"
          placeholderTextColor="#888"
          value={toolName}
          onChangeText={setToolName}
          style={styles.input}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Your location (zip code or city)</Text>
        <TextInput
          placeholder="e.g. 60614 or Chicago"
          placeholderTextColor="#888"
          value={locationInput}
          onChangeText={setLocationInput}
          style={styles.input}
          autoCapitalize="words"
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
            placeholder="Miles (e.g. 10)"
            placeholderTextColor="#888"
            value={pickupRadiusMiles}
            onChangeText={(t) =>
              setPickupRadiusMiles(t.replace(/[^0-9]/g, '').slice(0, 3))
            }
            style={[styles.input, styles.durationDaysInput]}
            keyboardType="number-pad"
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
            placeholder="Number of days"
            placeholderTextColor="#888"
            value={durationDays}
            onChangeText={setDurationDays}
            style={[styles.input, styles.durationDaysInput]}
            keyboardType="number-pad"
          />
        )}
        {durationType === 'weekly' && (
          <TextInput
            placeholder="Number of weeks"
            placeholderTextColor="#888"
            value={durationWeeks}
            onChangeText={setDurationWeeks}
            style={[styles.input, styles.durationDaysInput]}
            keyboardType="number-pad"
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
            placeholder="0"
            placeholderTextColor="#888"
            value={totalPriceInput}
            onChangeText={(t) => setTotalPriceInput(sanitizeMoneyDigits(t))}
            style={styles.moneyInput}
            keyboardType="decimal-pad"
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
              placeholder="0"
              placeholderTextColor="#888"
              value={deliveryFeeInput}
              onChangeText={(t) => setDeliveryFeeInput(sanitizeMoneyDigits(t))}
              style={styles.moneyInput}
              keyboardType="decimal-pad"
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
            setRequests(getRequests());
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

      <View style={styles.sectionDivider} />

      <Text style={styles.yourRequestsTitle}>Your Requests</Text>
      <View style={styles.requestsList}>
        {requests.length === 0 && (
          <Text style={styles.noRequestsText}>
            No requests yet. Create one above.
          </Text>
        )}
        {requests.map((req, idx) => {
          const matched = !!req.matched;
          const rowKey = req.timestamp ?? idx;

          const card = (
            <Pressable
              style={({ pressed }) => [
                requestListCardSurface.card,
                matched && styles.requestCardMatched,
                pressed && styles.requestCardPressed,
              ]}
              onPress={() => {
                if (req.timestamp == null) return;
                router.push({
                  pathname: '/request-details',
                  params: { requestId: String(req.timestamp) },
                });
              }}
            >
              <RequestListCardInner
                req={req}
                matched={matched}
                timeAgoText={
                  req.timestamp != null ? getTimeAgo(req.timestamp) : null
                }
              />
              {req.timestamp != null && (
                <Text style={styles.offersReceived}>
                  {formatOffersReceived(countOffersForRequest(req.timestamp))}
                </Text>
              )}
            </Pressable>
          );

          if (matched) {
            return (
              <View key={rowKey} style={styles.cardRowWrap}>
                {card}
              </View>
            );
          }

          return (
            <View key={rowKey} style={styles.cardRowWrap}>
              <Swipeable
                ref={(el) => {
                  const ts = req.timestamp;
                  if (ts == null) return;
                  if (el) swipeRefs.current.set(ts, el);
                  else swipeRefs.current.delete(ts);
                }}
                overshootRight={false}
                renderRightActions={() => (
                  <View style={styles.rightActionsRow}>
                    <Pressable
                      style={styles.editAction}
                      onPress={() => {
                        if (req.timestamp == null) return;
                        swipeRefs.current.get(req.timestamp)?.close();
                        setToolName(req.toolName ?? '');
                        setWhen(req.when ?? null);
                        setHow(isHowKey(req.how) ? req.how : null);
                        setPickupRadiusMiles(
                          req.pickupRadiusMiles != null &&
                            Number.isFinite(Number(req.pickupRadiusMiles))
                            ? String(Math.max(1, Math.round(Number(req.pickupRadiusMiles))))
                            : '10'
                        );
                        setDurationType(
                          isDurationType(req.durationType) ? req.durationType : null
                        );
                        setDurationDays(
                          req.durationType === 'multiDay' &&
                            req.durationValue != null &&
                            Number.isFinite(Number(req.durationValue))
                            ? String(Math.round(Number(req.durationValue)))
                            : ''
                        );
                        setDurationWeeks(
                          req.durationType === 'weekly' &&
                            req.durationValue != null &&
                            Number.isFinite(Number(req.durationValue))
                            ? String(Math.round(Number(req.durationValue)))
                            : ''
                        );
                        const tp = getNumericTotalPrice(req);
                        setTotalPriceInput(
                          tp != null && tp >= 0 ? sanitizeMoneyDigits(String(tp)) : ''
                        );
                        const df =
                          typeof req.deliveryFee === 'number' &&
                          Number.isFinite(req.deliveryFee)
                            ? req.deliveryFee
                            : parseMoneyToNumber(String(req.deliveryFee ?? ''));
                        setDeliveryFeeInput(
                          df != null && df >= 0 ? sanitizeMoneyDigits(String(df)) : ''
                        );
                        setLocationInput(
                          req.location != null ? String(req.location) : ''
                        );
                        setEditingTimestamp(req.timestamp);
                      }}
                    >
                      <Text style={styles.editActionText}>Edit</Text>
                    </Pressable>
                    <Pressable
                      style={styles.deleteAction}
                      onPress={() => {
                        if (req.timestamp == null) return;
                        removeOffersForRequest(req.timestamp);
                        removeRequest(req.timestamp);
                        setEditingTimestamp((t) => (t === req.timestamp ? null : t));
                        setRequests(getRequests());
                      }}
                    >
                      <Text style={styles.deleteActionText}>Delete</Text>
                    </Pressable>
                  </View>
                )}
              >
                {card}
              </Swipeable>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF', // White background for the full screen
  },
  scrollContent: {
    paddingHorizontal: 24,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
  },
  titleSide: {
    width: 44,
  },
  titleSideRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
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
  sectionDivider: {
    height: 1,
    backgroundColor: ui.border,
    marginTop: 28,
    marginBottom: 28,
  },
  yourRequestsTitle: {
    fontSize: 19,
    fontWeight: '700',
    marginBottom: 16,
    color: ui.text,
    textAlign: 'left',
  },
  requestsList: {
    marginBottom: 20,
  },
  cardRowWrap: {
    marginBottom: 14,
  },
  requestCardMatched: {
    backgroundColor: '#F4FAF4',
    borderColor: '#C5E0C7',
  },
  requestCardPressed: {
    opacity: ui.pressOpacity,
  },
  offersReceived: {
    fontSize: 12,
    color: '#868686',
    marginTop: 8,
    fontWeight: '500',
  },
  noRequestsText: {
    color: ui.textSubtle,
    fontSize: 15,
    textAlign: 'left',
    marginBottom: 8,
    lineHeight: 22,
  },
  rightActionsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  editAction: {
    backgroundColor: ui.primary,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
  },
  editActionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteAction: {
    backgroundColor: '#E53935',
    justifyContent: 'center',
    alignItems: 'center',
    width: 88,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
  },
  deleteActionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});