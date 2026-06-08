import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ui } from '@/constants/appUi';

export function AuthTrustLine({
  text,
  variant = 'light',
}: {
  text: string;
  variant?: 'light' | 'onDark';
}) {
  const onDark = variant === 'onDark';
  return (
    <View style={[styles.row, onDark && styles.rowDark]}>
      <Ionicons
        name="shield-checkmark-outline"
        size={16}
        color={onDark ? 'rgba(255,255,255,0.9)' : ui.primary}
      />
      <Text style={[styles.text, onDark && styles.textDark]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.65)',
  },
  rowDark: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
    color: ui.primary,
  },
  textDark: {
    color: 'rgba(255,255,255,0.95)',
  },
});
