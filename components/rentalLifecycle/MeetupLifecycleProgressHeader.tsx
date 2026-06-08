import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  MEETUP_LIFECYCLE_THEME,
  type MeetupLifecyclePhaseKey,
} from '@/lib/rentalLifecycle/meetupLifecycleTheme';
import type { MeetupLifecycleProgressIndex } from '@/lib/rentalLifecycle/meetupLifecycle';

const PHASE_ORDER: MeetupLifecyclePhaseKey[] = [
  'equipment_inspection',
  'rental_authorization',
  'rental_active',
];

const PHASE_SHORT_LABELS: Record<MeetupLifecyclePhaseKey, string> = {
  equipment_inspection: 'Inspection',
  rental_authorization: 'Authorization',
  rental_active: 'Active',
};

export function MeetupLifecycleProgressHeader({
  activePhase,
  progressIndex,
}: {
  activePhase: MeetupLifecyclePhaseKey;
  progressIndex: MeetupLifecycleProgressIndex;
}) {
  const activeTheme = MEETUP_LIFECYCLE_THEME[activePhase];

  return (
    <View style={styles.wrap}>
      <Text style={styles.phaseLabel}>
        Phase {activeTheme.phase} · {activeTheme.label}
      </Text>
      <View style={styles.phaseLabels}>
        {PHASE_ORDER.map((key) => (
          <Text
            key={key}
            style={[
              styles.phaseShortLabel,
              key === activePhase && { color: activeTheme.primary, fontWeight: '800' },
            ]}
          >
            {PHASE_SHORT_LABELS[key]}
          </Text>
        ))}
      </View>
      <View style={styles.track}>
        {PHASE_ORDER.map((key, index) => {
          const theme = MEETUP_LIFECYCLE_THEME[key];
          const done = index < progressIndex;
          const current = index === progressIndex;
          return (
            <React.Fragment key={key}>
              <View
                style={[
                  styles.dot,
                  done && { backgroundColor: theme.primary },
                  current && {
                    backgroundColor: theme.primary,
                    transform: [{ scale: 1.15 }],
                  },
                  !done && !current && { backgroundColor: theme.progressInactive },
                ]}
              />
              {index < PHASE_ORDER.length - 1 ? (
                <View
                  style={[
                    styles.connector,
                    index < progressIndex
                      ? { backgroundColor: MEETUP_LIFECYCLE_THEME[PHASE_ORDER[index + 1]].primary }
                      : { backgroundColor: theme.progressInactive },
                  ]}
                />
              ) : null}
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginBottom: 16 },
  phaseLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#64748B',
  },
  phaseLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  phaseShortLabel: { fontSize: 11, fontWeight: '600', color: '#94A3B8' },
  track: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  connector: { flex: 1, height: 3, borderRadius: 2, marginHorizontal: 4 },
});
