import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ui } from '@/constants/appUi';
import { formatWizardDateTime, formatWizardLocation } from '@/lib/rentalWizard/formatWizardSchedule';

/** Matches `WizardTransitionShell` subheadline width — summary cards align to confirmation copy. */
export const WIZARD_TRANSITION_SUMMARY_MAX_WIDTH = 300;

export type MeetupTransitionPhase = 'pickup' | 'return';

const PHASE_LABELS: Record<
  MeetupTransitionPhase,
  { location: string; schedule: string }
> = {
  pickup: {
    location: 'Pickup location',
    schedule: 'Pickup date & time',
  },
  return: {
    location: 'Return location',
    schedule: 'Return date & time',
  },
};

function TransitionSummaryCard({
  icon,
  label,
  value,
}: {
  icon: 'location-outline' | 'calendar-outline';
  label: string;
  value: string;
}) {
  return (
    <View style={styles.summaryCard}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={18} color={ui.primary} />
      </View>
      <View style={styles.textCol}>
        <Text style={styles.summaryLabel}>{label}</Text>
        <Text style={styles.summaryValue}>{value}</Text>
      </View>
    </View>
  );
}

export type WizardTransitionConfirmedDetailsProps = {
  phase: MeetupTransitionPhase;
  location?: string | null;
  scheduleIso: string | null;
};

/** Read-only stacked summary for dark transition confirmation screens. Location first, then schedule. */
export function WizardTransitionConfirmedDetails({
  phase,
  location,
  scheduleIso,
}: WizardTransitionConfirmedDetailsProps) {
  const labels = PHASE_LABELS[phase];
  const locationValue = location ? formatWizardLocation(location) : null;

  return (
    <View style={styles.stack}>
      {locationValue ? (
        <TransitionSummaryCard icon="location-outline" label={labels.location} value={locationValue} />
      ) : null}
      <TransitionSummaryCard
        icon="calendar-outline"
        label={labels.schedule}
        value={formatWizardDateTime(scheduleIso)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: WIZARD_TRANSITION_SUMMARY_MAX_WIDTH,
    gap: 10,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F5F3FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: ui.textSecondary,
    letterSpacing: 0.2,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '600',
    color: ui.textPrimary,
    lineHeight: 22,
  },
});
