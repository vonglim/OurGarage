import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useMemo, useRef, useState } from 'react';
import {
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
  meetup_location: string | null;
  return_time: string | null;
  return_location: string | null;
  confirmed_by_renter: boolean;
  confirmed_by_owner: boolean;
};

type Props = {
  rental: RentalMeetupDetails;
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

export function RentalDetailsCard({
  rental,
  itemName: _itemName,
  durationLabel,
  isRenter,
  isOwner,
  busy = false,
  onConfirm,
  onProposeChange,
}: Props) {
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

  const bothConfirmed = rental.confirmed_by_owner && rental.confirmed_by_renter;
  const sharedRentalLocation = (rental.meetup_location || rental.return_location || '').trim();
  const canConfirm = Boolean(
    rental.meetup_time && sharedRentalLocation !== '' && rental.return_time
  );
  const roleLabel = isRenter ? 'Renter' : isOwner ? 'Owner' : 'Participant';

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
      <Text style={styles.title}>Rental Details</Text>
      <Text style={styles.durationLabel}>Duration · {durationLabel || '—'}</Text>

      <Text style={styles.detailLine}>
        <Text style={styles.detailEmoji}>📅 </Text>
        <Text style={styles.detailLabel}>Pickup: </Text>
        <Text style={styles.detailValue}>{formatCompactMeetup(rental.meetup_time)}</Text>
      </Text>

      <Text style={[styles.detailLine, styles.returnBlockTop]}>
        <Text style={styles.detailEmoji}>🔁 </Text>
        <Text style={styles.detailLabel}>Return: </Text>
        <Text style={styles.detailValue}>{formatCompactMeetup(rental.return_time ?? null)}</Text>
      </Text>
      <View style={styles.locationRow}>
        <Text style={styles.locationEmoji}>📍</Text>
        <Text style={styles.locationText} numberOfLines={2}>
          {sharedRentalLocation || 'Not set'}
        </Text>
      </View>

      <Text style={styles.confirmTicks}>
        Owner {rental.confirmed_by_owner ? '✓' : '○'} · Renter {rental.confirmed_by_renter ? '✓' : '○'}
      </Text>
      <Text style={styles.status}>{statusLabel}</Text>
      <Text style={styles.role}>You are: {roleLabel}</Text>

      <View style={styles.actions}>
        <Pressable
          pressOpacityFeedback={false}
          onPress={openPropose}
          style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
          disabled={busy || submitting}
        >
          <Text style={styles.secondaryBtnText}>Propose</Text>
        </Pressable>
        <Pressable
          pressOpacityFeedback={false}
          onPress={() => void onConfirm()}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
          disabled={busy || submitting || !canConfirm}
        >
          <Text style={[styles.primaryBtnText, !canConfirm && styles.disabledText]}>Confirm</Text>
        </Pressable>
      </View>

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
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 10,
    backgroundColor: '#F7F8FB',
    borderColor: ui.border,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 7,
    marginBottom: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 2,
  },
  durationLabel: {
    fontSize: 11,
    color: ui.textSecondary,
    marginBottom: 3,
    fontWeight: '500',
  },
  detailLine: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.textPrimary,
    lineHeight: 18,
    marginBottom: 2,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  detailEmoji: {
    fontSize: 14,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.textPrimary,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.textPrimary,
  },
  returnBlockTop: {
    marginTop: 6,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
    gap: 4,
  },
  locationEmoji: {
    fontSize: 12,
    marginTop: 1,
  },
  locationText: {
    flex: 1,
    fontSize: 12,
    color: ui.textPrimary,
    lineHeight: 16,
  },
  confirmTicks: {
    fontSize: 10,
    color: ui.textSubtle,
    fontWeight: '500',
    marginBottom: 2,
  },
  status: {
    marginTop: 2,
    fontSize: 11,
    color: ui.textSecondary,
    fontWeight: '400',
  },
  role: {
    marginTop: 1,
    fontSize: 10,
    color: ui.textSubtle,
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
