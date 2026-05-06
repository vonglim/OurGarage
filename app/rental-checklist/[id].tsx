import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenEntrance } from '@/components/ScreenEntrance';
import { KeyboardDismissScreen } from '@/components/KeyboardDismissScreen';
import { ui } from '@/constants/appUi';

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export default function RentalChecklistScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rentalId = (firstParam(params.id) ?? '').trim();

  return (
    <KeyboardDismissScreen style={styles.screen}>
      <ScreenEntrance style={styles.fill}>
        <View style={styles.center}>
          <Text style={styles.title}>Rental Checklist</Text>
          <Text style={styles.body}>
            {rentalId ? `Checklist for rental ${rentalId}` : 'Checklist unavailable.'}
          </Text>
        </View>
      </ScreenEntrance>
    </KeyboardDismissScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: ui.surfaceGrouped,
  },
  fill: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    color: ui.textSecondary,
    textAlign: 'center',
  },
});
