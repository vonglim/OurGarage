import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { wizardSectionLabelStyle } from '@/components/wizard/wizardSectionStyles';
import type { CoordinateTimeSlot } from '@/lib/rentalWizard/buildCoordinateTimeSlots';
import type { WizardHandoffMethod } from '@/lib/rentalWizard/wizardMeetupDraft';
import { agreedMethodLabel } from '@/lib/rentalWizard/wizardMeetupDraft';
import {
  wizardLayout,
  wizardSectionBlockStyle,
  wizardSectionContentStyle,
  wizardSectionStackStyle,
} from '@/constants/wizardLayout';
import { ui } from '@/constants/appUi';
import { formatWizardDateTime } from '@/lib/rentalWizard/formatWizardSchedule';

export type WizardCoordinateStepProps = {
  phase: 'pickup' | 'return';
  agreedMethod: WizardHandoffMethod;
  agreedDeliveryFee: number | null;
  method: WizardHandoffMethod;
  onMethodChange: (method: WizardHandoffMethod) => void;
  /** When true, show fixed handoff from original agreement (return screen). */
  methodReadOnly?: boolean;
  location: string;
  locationCardTitle: string;
  /** Overrides default time field label (e.g. calmer return copy). */
  scheduleFieldTitle?: string;
  onPressLocation: () => void;
  scheduleIso: string | null;
  /** Locks location/time editing (waiting for owner, etc.). */
  lockFields?: boolean;
  /** Hide preset time chips (calmer return confirmation). */
  hideTimeChips?: boolean;
  waitingForOwner?: boolean;
  timeSlots: CoordinateTimeSlot[];
  selectedTimeIso: string | null;
  onSelectTimeSlot: (iso: string) => void;
  onPressTime: () => void;
};

export function WizardCoordinateStep({
  phase,
  agreedMethod,
  agreedDeliveryFee,
  method,
  onMethodChange,
  methodReadOnly = false,
  location,
  locationCardTitle,
  scheduleFieldTitle,
  onPressLocation,
  scheduleIso,
  lockFields = false,
  hideTimeChips = false,
  waitingForOwner = false,
  timeSlots,
  selectedTimeIso,
  onSelectTimeSlot,
  onPressTime,
}: WizardCoordinateStepProps) {
  const isPickup = phase === 'pickup';
  const fieldsLocked = lockFields || waitingForOwner;
  const pickupSelected = method === 'pickup';

  const pickupLabel = pickupSelected ? 'Pickup' : agreedMethod === 'delivery' ? 'Switch to pickup' : 'Pickup';
  const pickupHint =
    !pickupSelected && agreedMethod === 'delivery' ? 'Save delivery fee' : undefined;

  const deliveryLabel = pickupSelected
    ? agreedMethod === 'pickup'
      ? 'Request delivery'
      : agreedMethodLabel('delivery', agreedDeliveryFee)
    : agreedMethodLabel('delivery', agreedDeliveryFee);
  const deliveryHint =
    pickupSelected && agreedMethod === 'pickup' ? '+ delivery fee may apply' : undefined;

  const showTimeChips = !fieldsLocked && !hideTimeChips;

  const locationPlaceholder = isPickup ? 'Add a meetup location' : 'Add a return location';
  const timeFieldTitle =
    scheduleFieldTitle ??
    (fieldsLocked
      ? waitingForOwner
        ? 'Proposed time'
        : 'Confirmed time'
      : isPickup
        ? 'Select a time'
        : 'Select return time');

  return (
    <View style={wizardSectionStackStyle}>
      <View style={wizardSectionBlockStyle}>
        <Text style={wizardSectionLabelStyle.kicker}>
          {isPickup ? 'PICKUP METHOD' : 'RETURN METHOD'}
        </Text>
        {methodReadOnly ? (
          <View style={styles.methodReadOnlyCard}>
            <Ionicons
              name={agreedMethod === 'delivery' ? 'car-outline' : 'walk-outline'}
              size={20}
              color={ui.primary}
            />
            <View style={styles.methodReadOnlyText}>
              <Text style={styles.methodReadOnlyLabel}>
                {agreedMethodLabel(agreedMethod, agreedDeliveryFee)}
              </Text>
              <Text style={styles.methodReadOnlyHint}>Matches your pickup agreement.</Text>
            </View>
          </View>
        ) : (
          <View style={styles.methodRow}>
            <MethodCard
              selected={pickupSelected}
              label={pickupLabel}
              hint={pickupHint}
              icon="walk-outline"
              disabled={fieldsLocked}
              onPress={() => onMethodChange('pickup')}
            />
            <MethodCard
              selected={!pickupSelected}
              label={deliveryLabel}
              hint={deliveryHint}
              icon="car-outline"
              disabled={fieldsLocked}
              onPress={() => onMethodChange('delivery')}
            />
          </View>
        )}
      </View>

      <View style={wizardSectionBlockStyle}>
        <Text style={wizardSectionLabelStyle.kicker}>LOCATION</Text>
        <Pressable
          onPress={fieldsLocked ? undefined : onPressLocation}
          disabled={fieldsLocked}
          style={({ pressed }) => [
            styles.fieldCard,
            !fieldsLocked && pressed && { opacity: 0.92 },
          ]}
        >
          <View style={styles.fieldIcon}>
            <Ionicons name="location-outline" size={18} color={ui.primary} />
          </View>
          <View style={styles.fieldText}>
            <Text style={styles.fieldTitle}>{locationCardTitle}</Text>
            <Text style={styles.fieldValue}>{location || locationPlaceholder}</Text>
          </View>
          {!fieldsLocked ? (
            <View style={styles.changeBtn}>
              <Text style={styles.changeBtnText}>Change</Text>
              <Ionicons name="chevron-forward" size={16} color={ui.primary} />
            </View>
          ) : null}
        </Pressable>
      </View>

      <View style={wizardSectionBlockStyle}>
        <Text style={wizardSectionLabelStyle.kicker}>TIME</Text>
        <View style={wizardSectionContentStyle}>
          <Pressable
            onPress={fieldsLocked ? undefined : onPressTime}
            disabled={fieldsLocked}
            style={({ pressed }) => [
              styles.fieldCard,
              !fieldsLocked && pressed && { opacity: 0.92 },
            ]}
          >
            <View style={styles.fieldIcon}>
              <Ionicons name="calendar-outline" size={18} color={ui.primary} />
            </View>
            <View style={styles.fieldText}>
              <Text style={styles.fieldTitle}>{timeFieldTitle}</Text>
              <Text style={styles.fieldValue}>
                {scheduleIso ? formatWizardDateTime(scheduleIso) : 'Choose a time slot'}
              </Text>
            </View>
            {!fieldsLocked ? (
              <View style={styles.changeBtn}>
                <Text style={styles.changeBtnText}>Change</Text>
                <Ionicons name="chevron-forward" size={16} color={ui.primary} />
              </View>
            ) : null}
          </Pressable>

          {showTimeChips ? (
            <View style={styles.slotRow}>
              {timeSlots.map((slot) => (
                <TimeSlotChip
                  key={slot.id}
                  label={slot.label}
                  selected={selectedTimeIso === slot.iso}
                  onPress={() => onSelectTimeSlot(slot.iso)}
                />
              ))}
              <TimeSlotChip
                label="Custom"
                icon="calendar-outline"
                selected={false}
                onPress={onPressTime}
              />
            </View>
          ) : null}
        </View>
      </View>

      {waitingForOwner ? (
        <View style={styles.waitingBanner}>
          <Ionicons name="time-outline" size={16} color={ui.primary} />
          <Text style={styles.waitingText}>
            Waiting for the owner to review your proposal. You can still message them with questions.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function MethodCard({
  selected,
  label,
  hint,
  icon,
  disabled,
  onPress,
}: {
  selected: boolean;
  label: string;
  hint?: string;
  icon: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.methodCard,
        selected && styles.methodCardOn,
        disabled && styles.methodCardDisabled,
        pressed && !disabled && { opacity: 0.92 },
      ]}
    >
      <Ionicons name={icon} size={18} color={selected ? ui.primary : ui.textSecondary} />
      <Text style={[styles.methodLabel, selected && styles.methodLabelOn]}>{label}</Text>
      {hint ? <Text style={styles.methodHint}>{hint}</Text> : null}
    </Pressable>
  );
}

function TimeSlotChip({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.slot,
        selected && styles.slotOn,
        pressed && { opacity: 0.9 },
      ]}
    >
      {icon ? (
        <Ionicons name={icon} size={14} color={selected ? ui.primary : ui.textSecondary} />
      ) : null}
      <Text style={[styles.slotText, selected && styles.slotTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  methodRow: { flexDirection: 'row', gap: wizardLayout.cardGap },
  methodReadOnlyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    padding: 14,
  },
  methodReadOnlyText: { flex: 1, minWidth: 0, gap: 4 },
  methodReadOnlyLabel: { fontSize: 15, fontWeight: '700', color: ui.textPrimary },
  methodReadOnlyHint: { fontSize: 12, fontWeight: '500', color: ui.textMuted, lineHeight: 16 },
  methodCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 6,
    minHeight: 80,
    justifyContent: 'center',
  },
  methodCardOn: { borderColor: ui.primary, backgroundColor: '#F5F3FF' },
  methodCardDisabled: { opacity: 0.85 },
  methodLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: ui.textSecondary,
    textAlign: 'center',
    lineHeight: 17,
  },
  methodLabelOn: { color: ui.primary },
  methodHint: {
    fontSize: 11,
    fontWeight: '500',
    color: ui.textMuted,
    textAlign: 'center',
    lineHeight: 14,
  },
  fieldCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    padding: 14,
  },
  fieldIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F5F3FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldText: { flex: 1, minWidth: 0 },
  fieldTitle: { fontSize: 12, fontWeight: '600', color: ui.textSecondary },
  fieldValue: { marginTop: 2, fontSize: 14, fontWeight: '700', color: ui.textPrimary },
  changeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  changeBtnText: { fontSize: 13, fontWeight: '700', color: ui.primary },
  slotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  slotOn: { borderColor: ui.primary, backgroundColor: '#F5F3FF' },
  slotText: { fontSize: 13, fontWeight: '600', color: ui.textPrimary },
  slotTextOn: { color: ui.primary },
  waitingBanner: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    alignItems: 'flex-start',
  },
  waitingText: { flex: 1, fontSize: 13, fontWeight: '500', color: '#4338CA', lineHeight: 18 },
});
