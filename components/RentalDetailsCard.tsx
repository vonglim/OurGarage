import DateTimePicker from '@react-native-community/datetimepicker';
import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

import { Pressable } from '@/components/Pressable';
import { subtleControlPressed, ui } from '@/constants/appUi';

export type RentalMeetupDetails = {
  id: string;
  offer_id: string | null;
  request_id: string | null;
  renter_user_id: string;
  owner_user_id: string;
  meetup_time: string | null;
  pickup_datetime?: string | null;
  meetup_location: string | null;
  return_time: string | null;
  return_datetime?: string | null;
  return_location: string | null;
  confirmed_by_renter: boolean;
  confirmed_by_owner: boolean;
  renter_confirmed?: boolean;
  owner_confirmed?: boolean;
  agreement_status?: 'pending' | 'confirmed' | string | null;
  confirmed_at?: string | null;
  last_proposed_by?: string | null;
  proposal_version?: number | null;
  proposal_updated_at?: string | null;
  latest_proposal_message_id?: string | null;
};

type Props = {
  rental: RentalMeetupDetails;
  headerTitle?: string;
  headerLeftAccessory?: React.ReactNode;
  showHeaderEditAction?: boolean;
  itemName: string;
  durationLabel: string;
  isRenter: boolean;
  isOwner: boolean;
  busy?: boolean;
  onConfirm: () => Promise<void>;
  onProposeChange: (input: {
    meetupTimeIso: string;
    returnTimeIso: string;
    meetupLocation: string;
  }) => Promise<void>;
};

export type RentalDetailsCardHandle = {
  openProposeModal: () => void;
};

type PickerField = 'pickupDate' | 'pickupTime' | 'returnDate' | 'returnTime';

/** One-line display e.g. "May 25 • 5:22 PM" */
function formatCompactMeetup(value: string | null): string {
  if (!value) return 'Not scheduled';
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return 'Not scheduled';
  const d = new Date(t);
  const datePart = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timePart = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${datePart} • ${timePart}`;
}

function mergeDateKeepTime(base: Date, picked: Date): Date {
  const out = new Date(base);
  out.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  return out;
}

function mergeTimeKeepDate(base: Date, picked: Date): Date {
  const out = new Date(base);
  out.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  return out;
}

/** e.g. "Tue, May 5" for pressable date field */
function formatPickedDateCompact(d: Date): string {
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatPickedTime(d: Date): string {
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function initialDraftDate(iso: string | null): Date {
  if (iso) {
    const t = Date.parse(iso);
    if (Number.isFinite(t)) return new Date(t);
  }
  return new Date();
}

function initialReturnDraft(iso: string | null, pickup: Date): Date {
  if (iso) {
    const t = Date.parse(iso);
    if (Number.isFinite(t)) return new Date(t);
  }
  const d = new Date(pickup);
  d.setDate(d.getDate() + 1);
  return d;
}

/** Android uses system dialogs; iOS (and web) use embedded spinners + Done. */
const useEmbeddedPickers = Platform.OS === 'ios' || Platform.OS === 'web';

export const RentalDetailsCard = forwardRef<RentalDetailsCardHandle, Props>(function RentalDetailsCard(
  {
    rental,
    headerTitle = 'Rental',
    headerLeftAccessory,
    showHeaderEditAction = false,
    itemName: _itemName,
    durationLabel,
    isRenter,
    isOwner,
    busy = false,
    onConfirm,
    onProposeChange,
  }: Props,
  ref
) {
  const [proposeOpen, setProposeOpen] = useState(false);
  const [meetupDraft, setMeetupDraft] = useState<Date>(() => initialDraftDate(rental.meetup_time));
  const [returnDraft, setReturnDraft] = useState<Date>(() =>
    initialReturnDraft(rental.return_time ?? null, initialDraftDate(rental.meetup_time))
  );
  const [meetupLocation, setMeetupLocation] = useState(
    (rental.meetup_location || rental.return_location || '').trim() || ''
  );
  const [recentLocations, setRecentLocations] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [activePicker, setActivePicker] = useState<PickerField | null>(null);
  const pickerTargetRef = useRef<PickerField | null>(null);

  const isOwnerConfirmed =
    typeof rental.owner_confirmed === 'boolean' ? rental.owner_confirmed : rental.confirmed_by_owner;
  const isRenterConfirmed =
    typeof rental.renter_confirmed === 'boolean' ? rental.renter_confirmed : rental.confirmed_by_renter;
  const bothConfirmed =
    rental.agreement_status === 'confirmed' || (isOwnerConfirmed && isRenterConfirmed);
  const confirmAnim = useRef(new Animated.Value(bothConfirmed ? 1 : 0)).current;
  const sharedRentalLocation = (rental.meetup_location || rental.return_location || '').trim();
  const pickupIso = rental.pickup_datetime ?? rental.meetup_time;
  const returnIso = rental.return_datetime ?? rental.return_time ?? null;
  const canConfirm = Boolean(
    rental.meetup_time && sharedRentalLocation !== '' && rental.return_time
  );
  React.useEffect(() => {
    setMeetupLocation((rental.meetup_location || rental.return_location || '').trim() || '');
  }, [rental]);

  const openPropose = () => {
    const pickup = initialDraftDate(rental.meetup_time);
    setMeetupDraft(pickup);
    setReturnDraft(initialReturnDraft(rental.return_time ?? null, pickup));
    setMeetupLocation((rental?.meetup_location || rental?.return_location || '').trim() || '');
    pickerTargetRef.current = null;
    setActivePicker(null);
    setProposeOpen(true);
  };
  useImperativeHandle(
    ref,
    () => ({
      openProposeModal: openPropose,
    }),
    [rental]
  );

  const closePicker = () => {
    pickerTargetRef.current = null;
    setActivePicker(null);
  };

  const openPicker = (kind: PickerField) => {
    Keyboard.dismiss();
    if (useEmbeddedPickers) {
      setActivePicker((cur) => {
        if (cur === kind) {
          pickerTargetRef.current = null;
          return null;
        }
        pickerTargetRef.current = kind;
        return kind;
      });
    } else {
      pickerTargetRef.current = kind;
      setActivePicker(kind);
    }
  };

  const onAndroidDateChange = (_event: unknown, selected?: Date) => {
    const k = pickerTargetRef.current;
    setActivePicker(null);
    pickerTargetRef.current = null;
    if (!selected || !k) return;
    if (k === 'pickupDate') setMeetupDraft((prev) => mergeDateKeepTime(prev, selected));
    if (k === 'returnDate') setReturnDraft((prev) => mergeDateKeepTime(prev, selected));
  };

  const onAndroidTimeChange = (_event: unknown, selected?: Date) => {
    const k = pickerTargetRef.current;
    setActivePicker(null);
    pickerTargetRef.current = null;
    if (!selected || !k) return;
    if (k === 'pickupTime') setMeetupDraft((prev) => mergeTimeKeepDate(prev, selected));
    if (k === 'returnTime') setReturnDraft((prev) => mergeTimeKeepDate(prev, selected));
  };

  const applyEmbeddedDateChange = (d: Date) => {
    const k = pickerTargetRef.current ?? activePicker;
    if (k === 'pickupDate') setMeetupDraft((prev) => mergeDateKeepTime(prev, d));
    if (k === 'returnDate') setReturnDraft((prev) => mergeDateKeepTime(prev, d));
  };

  const applyEmbeddedTimeChange = (d: Date) => {
    const k = pickerTargetRef.current ?? activePicker;
    if (k === 'pickupTime') setMeetupDraft((prev) => mergeTimeKeepDate(prev, d));
    if (k === 'returnTime') setReturnDraft((prev) => mergeTimeKeepDate(prev, d));
  };

  const handleSubmit = async () => {
    const loc = meetupLocation.trim();
    if (!loc) {
      alert('Enter meetup location');
      return;
    }
    if (Number.isNaN(meetupDraft.getTime()) || Number.isNaN(returnDraft.getTime())) {
      alert('Select valid pickup and return times');
      return;
    }
    if (returnDraft.getTime() <= meetupDraft.getTime()) {
      alert('Return must be after pickup');
      return;
    }
    setSubmitting(true);
    try {
      await onProposeChange({
        meetupTimeIso: meetupDraft.toISOString(),
        returnTimeIso: returnDraft.toISOString(),
        meetupLocation: loc,
      });
      setRecentLocations((prev) => {
        if (loc && !prev.includes(loc)) return [loc, ...prev].slice(0, 8);
        return prev;
      });
      Keyboard.dismiss();
      setProposeOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const statusLabel = useMemo(() => {
    if (bothConfirmed) return 'Confirmed';
    return 'Awaiting confirmation';
  }, [bothConfirmed]);
  React.useEffect(() => {
    Animated.timing(confirmAnim, {
      toValue: bothConfirmed ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [bothConfirmed, confirmAnim]);

  const meetupSuggestions = useMemo(() => {
    const q = meetupLocation.trim().toLowerCase();
    if (q === '') return recentLocations;
    return recentLocations.filter((x) => x.toLowerCase().includes(q));
  }, [meetupLocation, recentLocations]);

  const embeddedPickerValue =
    activePicker === 'pickupDate' || activePicker === 'pickupTime' ? meetupDraft : returnDraft;
  const embeddedPickerIsDate =
    activePicker === 'pickupDate' || activePicker === 'returnDate';

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        {headerLeftAccessory ? <View style={styles.headerLeftAccessory}>{headerLeftAccessory}</View> : null}
        <Text style={styles.title} numberOfLines={1}>
          {headerTitle}
        </Text>
        {showHeaderEditAction ? (
          <Pressable
            pressOpacityFeedback={false}
            onPress={openPropose}
            style={({ pressed }) => [styles.editBtn, pressed && styles.secondaryBtnPressed]}
          >
            <Text style={styles.editBtnText}>Propose Change</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.locationText} numberOfLines={1}>
        Location: {sharedRentalLocation || 'Not set'}
      </Text>

      <View style={styles.timeRow}>
        <View style={styles.timeCol}>
          <Text style={styles.metaLabel}>Pickup</Text>
          <Text style={styles.metaValue} numberOfLines={1}>
            {formatCompactMeetup(pickupIso)}
          </Text>
        </View>
        <View style={styles.timeCol}>
          <Text style={styles.metaLabel}>Return</Text>
          <Text style={styles.metaValue} numberOfLines={1}>
            {formatCompactMeetup(returnIso)}
          </Text>
        </View>
      </View>

      <View style={styles.bottomRow}>
        <Animated.Text
          style={[
            styles.confirmTicks,
            {
              color: confirmAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['#7F8794', '#4E7E64'],
              }),
            },
          ]}
          numberOfLines={1}
        >
          {isOwnerConfirmed ? '✓' : '○'} Owner   {isRenterConfirmed ? '✓' : '○'} Renter
        </Animated.Text>
        {!bothConfirmed ? (
          <Animated.Text
            style={[
              styles.status,
              styles.statusAwaiting,
              {
                color: confirmAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['#8B6B2E', '#2D825A'],
                }),
              },
            ]}
            numberOfLines={1}
          >
            Pending approval
          </Animated.Text>
        ) : null}
      </View>

      {bothConfirmed ? (
        <Animated.View
          style={[
            styles.confirmedBar,
            {
              opacity: confirmAnim,
              transform: [
                {
                  translateY: confirmAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-4, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={styles.confirmedBarText}>✓ Rental details confirmed</Text>
        </Animated.View>
      ) : null}

      <Modal
        visible={proposeOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          Keyboard.dismiss();
          closePicker();
          setProposeOpen(false);
        }}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Propose pickup & return</Text>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                style={styles.modalScroll}
              >
                <Text style={styles.modalLabel}>Meetup location</Text>
                <TextInput
                  value={meetupLocation}
                  onChangeText={setMeetupLocation}
                  placeholder="Where you’ll meet"
                  placeholderTextColor={ui.textSecondary}
                  style={styles.modalInput}
                />
                {meetupSuggestions.length > 0 ? (
                  <View style={styles.suggestionsWrap}>
                    {meetupSuggestions.map((s) => (
                      <Pressable
                        key={s}
                        pressOpacityFeedback={false}
                        onPress={() => setMeetupLocation(s)}
                        style={({ pressed }) => [styles.suggestionItem, pressed && styles.secondaryBtnPressed]}
                      >
                        <Text style={styles.suggestionText}>{s}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                <Text style={styles.modalSectionTitle}>Pickup</Text>
                <View style={styles.pickerRow}>
                  <Pressable
                    pressOpacityFeedback={false}
                    onPress={() => openPicker('pickupDate')}
                    style={({ pressed }) => [styles.pickerValueCell, pressed && styles.secondaryBtnPressed]}
                  >
                    <Text style={styles.pickerValueText}>{formatPickedDateCompact(meetupDraft)}</Text>
                  </Pressable>
                  <Pressable
                    pressOpacityFeedback={false}
                    onPress={() => openPicker('pickupTime')}
                    style={({ pressed }) => [styles.pickerValueCell, pressed && styles.secondaryBtnPressed]}
                  >
                    <Text style={styles.pickerValueText}>{formatPickedTime(meetupDraft)}</Text>
                  </Pressable>
                </View>

                <Text style={[styles.modalSectionTitle, styles.modalSectionSpaced]}>Return</Text>
                <View style={styles.pickerRow}>
                  <Pressable
                    pressOpacityFeedback={false}
                    onPress={() => openPicker('returnDate')}
                    style={({ pressed }) => [styles.pickerValueCell, pressed && styles.secondaryBtnPressed]}
                  >
                    <Text style={styles.pickerValueText}>{formatPickedDateCompact(returnDraft)}</Text>
                  </Pressable>
                  <Pressable
                    pressOpacityFeedback={false}
                    onPress={() => openPicker('returnTime')}
                    style={({ pressed }) => [styles.pickerValueCell, pressed && styles.secondaryBtnPressed]}
                  >
                    <Text style={styles.pickerValueText}>{formatPickedTime(returnDraft)}</Text>
                  </Pressable>
                </View>
              </ScrollView>

              {useEmbeddedPickers && activePicker ? (
                <View style={styles.iosPickerHost}>
                  <View style={styles.iosPickerSurface}>
                    <View style={styles.iosPickerSpinnerShell}>
                      <DateTimePicker
                        key={`${activePicker}-${embeddedPickerIsDate ? 'd' : 't'}-${embeddedPickerValue.getTime()}`}
                        value={embeddedPickerValue}
                        mode={embeddedPickerIsDate ? 'date' : 'time'}
                        display="spinner"
                        themeVariant="light"
                        onChange={(_, d) => {
                          if (!d) return;
                          if (embeddedPickerIsDate) applyEmbeddedDateChange(d);
                          else applyEmbeddedTimeChange(d);
                        }}
                      />
                    </View>
                  </View>
                  <Pressable
                    pressOpacityFeedback={false}
                    onPress={closePicker}
                    style={({ pressed }) => [styles.doneChip, pressed && styles.secondaryBtnPressed]}
                  >
                    <Text style={styles.doneChipText}>Done</Text>
                  </Pressable>
                </View>
              ) : null}

              {Platform.OS === 'android' && activePicker === 'pickupDate' ? (
                <DateTimePicker value={meetupDraft} mode="date" display="default" onChange={onAndroidDateChange} />
              ) : null}
              {Platform.OS === 'android' && activePicker === 'pickupTime' ? (
                <DateTimePicker
                  value={meetupDraft}
                  mode="time"
                  display="default"
                  is24Hour={false}
                  onChange={onAndroidTimeChange}
                />
              ) : null}
              {Platform.OS === 'android' && activePicker === 'returnDate' ? (
                <DateTimePicker value={returnDraft} mode="date" display="default" onChange={onAndroidDateChange} />
              ) : null}
              {Platform.OS === 'android' && activePicker === 'returnTime' ? (
                <DateTimePicker
                  value={returnDraft}
                  mode="time"
                  display="default"
                  is24Hour={false}
                  onChange={onAndroidTimeChange}
                />
              ) : null}

              <View style={styles.modalActions}>
                <Pressable
                  pressOpacityFeedback={false}
                  onPress={() => {
                    Keyboard.dismiss();
                    closePicker();
                    setProposeOpen(false);
                  }}
                  style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
                >
                  <Text style={styles.secondaryBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  pressOpacityFeedback={false}
                  onPress={() => void handleSubmit()}
                  style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
                  disabled={submitting}
                >
                  <Text style={styles.primaryBtnText}>{submitting ? 'Saving...' : 'Submit'}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    backgroundColor: '#F7F8FB',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerLeftAccessory: {
    flexShrink: 0,
    marginRight: 2,
  },
  editBtn: {
    height: 34,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 17,
    backgroundColor: '#EEF4FF',
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  editBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E4FA3',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: ui.textPrimary,
    lineHeight: 20,
    flex: 1,
    paddingRight: 8,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 16,
    marginTop: 6,
  },
  timeCol: {
    flexGrow: 1,
    flexShrink: 1,
    maxWidth: 220,
  },
  metaLabel: {
    fontSize: 9,
    color: ui.textSecondary,
    fontWeight: '600',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metaValue: {
    fontSize: 16,
    color: ui.textPrimary,
    fontWeight: '600',
    lineHeight: 19,
  },
  locationText: {
    fontSize: 13,
    color: ui.textPrimary,
    lineHeight: 17,
    fontWeight: '500',
    marginTop: 3,
  },
  bottomRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 14,
    flexWrap: 'wrap',
  },
  confirmTicks: {
    fontSize: 10,
    color: ui.textSubtle,
    fontWeight: '500',
    lineHeight: 13,
    flexShrink: 0,
  },
  status: {
    fontSize: 10,
    fontWeight: '500',
    lineHeight: 13,
    flexShrink: 0,
  },
  statusAwaiting: {
    color: '#8B6B2E',
  },
  statusConfirmed: {
    color: '#2D825A',
  },
  confirmedBar: {
    marginTop: 5,
    minHeight: 36,
    borderRadius: 6,
    backgroundColor: '#E8F7EE',
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmedBarText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2E7D4F',
    lineHeight: 16,
    textAlign: 'center',
  },
  actions: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  primaryBtn: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: ui.primary,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnPressed: {
    ...subtleControlPressed,
  },
  primaryBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.primaryOn,
  },
  secondaryBtn: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: ui.background,
    borderColor: ui.border,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnPressed: {
    ...subtleControlPressed,
  },
  secondaryBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: ui.textPrimary,
  },
  disabledText: {
    opacity: 0.6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: ui.background,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    maxHeight: '92%',
  },
  modalScroll: {
    maxHeight: 520,
  },
  iosPickerHost: {
    width: '100%',
    marginTop: 6,
    marginBottom: 4,
    opacity: 1,
  },
  iosPickerSurface: {
    backgroundColor: '#fff',
    opacity: 1,
    borderRadius: 8,
    overflow: 'visible',
  },
  iosPickerSpinnerShell: {
    height: 180,
    justifyContent: 'center',
    backgroundColor: '#fff',
    opacity: 1,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 8,
  },
  modalSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 4,
    marginTop: 2,
  },
  modalSectionSpaced: {
    marginTop: 10,
  },
  modalLabel: {
    fontSize: 11,
    color: ui.textSecondary,
    marginBottom: 3,
    fontWeight: '600',
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginBottom: 4,
  },
  pickerValueCell: {
    flex: 1,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    backgroundColor: ui.surfaceInput,
    paddingVertical: 10,
    paddingHorizontal: 10,
    justifyContent: 'center',
    minHeight: 44,
  },
  pickerValueText: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.textPrimary,
    textAlign: 'center',
  },
  doneChip: {
    alignSelf: 'flex-end',
    marginTop: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: ui.surfaceTintPrimary,
  },
  doneChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.primary,
  },
  modalInput: {
    borderColor: ui.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: ui.textPrimary,
    marginBottom: 4,
  },
  modalActions: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 8,
  },
  suggestionsWrap: {
    marginTop: 4,
    marginBottom: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: ui.background,
  },
  suggestionItem: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
  },
  suggestionText: {
    color: ui.textPrimary,
    fontSize: 13,
  },
});
