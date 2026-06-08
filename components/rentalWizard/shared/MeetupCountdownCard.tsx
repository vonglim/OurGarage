import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ui } from '@/constants/appUi';
import {
  buildMeetupCountdownState,
  type MeetupCountdownStatus,
} from '@/lib/buildMeetupCountdownState';
import { getEffectiveNowMs } from '@/lib/rentalSimulation/simulationClock';

const STATUS_STYLES: Record<
  MeetupCountdownStatus,
  { backgroundColor: string; borderColor: string; iconColor: string }
> = {
  normal: { backgroundColor: '#F8FAFC', borderColor: ui.border, iconColor: ui.primary },
  upcoming: { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE', iconColor: ui.primary },
  imminent: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A', iconColor: '#D97706' },
  overdue: { backgroundColor: '#FEF2F2', borderColor: '#FECACA', iconColor: '#DC2626' },
};

export type MeetupCountdownCardProps = {
  pickupIso: string | null | undefined;
};

export function MeetupCountdownCard({ pickupIso }: MeetupCountdownCardProps) {
  const [nowMs, setNowMs] = useState(() => getEffectiveNowMs());

  const preview = useMemo(() => buildMeetupCountdownState(pickupIso, nowMs), [pickupIso, nowMs]);

  useEffect(() => {
    if (!preview.useLiveCountdown) return;
    const id = setInterval(() => setNowMs(getEffectiveNowMs()), 60_000);
    return () => clearInterval(id);
  }, [preview.useLiveCountdown, pickupIso]);

  const state = preview;
  const palette = STATUS_STYLES[state.status];

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.backgroundColor, borderColor: palette.borderColor },
      ]}
    >
      <Ionicons name={state.icon} size={20} color={palette.iconColor} />
      <View style={styles.text}>
        <Text style={styles.title}>{state.title}</Text>
        {state.subtitle ? <Text style={styles.subtitle}>{state.subtitle}</Text> : null}
        {state.footnote ? <Text style={styles.footnote}>{state.footnote}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, gap: 4 },
  title: { fontSize: 15, fontWeight: '700', color: ui.textPrimary, lineHeight: 20 },
  subtitle: { fontSize: 13, fontWeight: '500', color: ui.textSecondary, lineHeight: 18 },
  footnote: { fontSize: 13, color: ui.textSecondary, lineHeight: 18 },
});
