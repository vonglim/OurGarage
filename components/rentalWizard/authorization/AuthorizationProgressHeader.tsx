import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { authPremium } from '@/components/rentalWizard/authorization/authPremiumTheme';
import { ui } from '@/constants/appUi';
import {
  resolveAuthorizationJourneyProgress,
  type AuthorizationJourneyStepId,
  AUTHORIZATION_JOURNEY_STEPS,
  isAuthorizationJourneyStepComplete,
} from '@/lib/rentalAuthorization/authorizationJourney';
import type { RentalWizardContext, RentalWizardStep } from '@/lib/rentalWizard/types';

export function AuthorizationProgressHeader({
  ctx,
  activeStep,
  variant = 'light',
}: {
  ctx: RentalWizardContext;
  activeStep: RentalWizardStep;
  variant?: 'light' | 'onDark';
}) {
  const { current, total } = resolveAuthorizationJourneyProgress(activeStep);
  const onDark = variant === 'onDark';

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={[styles.kicker, onDark && styles.kickerDark]}>Protected rental</Text>
        <Text style={[styles.stepCount, onDark && styles.stepCountDark]}>
          {current} / {total}
        </Text>
      </View>
      <View style={[styles.track, onDark && styles.trackDark]}>
        <View
          style={[
            styles.fill,
            onDark && styles.fillDark,
            { width: `${(current / total) * 100}%` },
          ]}
        />
      </View>
      <View style={styles.dots}>
        {AUTHORIZATION_JOURNEY_STEPS.map((s) => {
          const done = isAuthorizationJourneyStepComplete(ctx, s.id as AuthorizationJourneyStepId);
          const active = s.wizardStep === activeStep;
          return (
            <View
              key={s.id}
              style={[
                styles.dot,
                onDark && styles.dotDark,
                done && (onDark ? styles.dotDoneDark : styles.dotDone),
                active && (onDark ? styles.dotActiveDark : styles.dotActive),
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, alignSelf: 'stretch', width: '100%' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    color: authPremium.ink.accent,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  kickerDark: { color: 'rgba(255,255,255,0.9)' },
  stepCount: {
    fontSize: 12,
    fontWeight: '700',
    color: authPremium.ink.secondary,
  },
  stepCountDark: { color: 'rgba(255,255,255,0.75)' },
  track: {
    height: 5,
    borderRadius: 3,
    backgroundColor: ui.border,
    overflow: 'hidden',
  },
  trackDark: { backgroundColor: 'rgba(255,255,255,0.2)' },
  fill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: ui.primary,
  },
  fillDark: { backgroundColor: '#FFFFFF' },
  dots: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#CBD5E1',
  },
  dotDark: { backgroundColor: 'rgba(255,255,255,0.25)' },
  dotDone: { backgroundColor: '#22C55E' },
  dotDoneDark: { backgroundColor: '#86EFAC' },
  dotActive: {
    backgroundColor: ui.primary,
    transform: [{ scaleX: 1.35 }],
  },
  dotActiveDark: {
    backgroundColor: '#FFFFFF',
    transform: [{ scaleX: 1.35 }],
  },
});
