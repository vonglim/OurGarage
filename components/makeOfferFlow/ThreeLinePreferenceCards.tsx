import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';

export type ThreeLineOption<K extends string = string> = {
  key: K;
  title: string;
  line: string;
};

type Props<K extends string> = {
  options: readonly ThreeLineOption<K>[];
  value: K;
  onChange: (key: K) => void;
};

/**
 * Shared “pick one card” pattern used by listing-offer receive step and rental-request handoff step.
 */
export function ThreeLinePreferenceCards<K extends string>({ options, value, onChange }: Props<K>) {
  return (
    <View>
      {options.map(({ key, title, line }) => {
        const on = value === key;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            style={({ pressed }) => [styles.optCard, on && styles.optCardOn, pressed && { opacity: 0.92 }]}
          >
            <Text style={[styles.optTitle, on && styles.optTitleOn]}>{title}</Text>
            <Text style={styles.optLine}>{line}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  optCard: {
    padding: ui.spaceMd,
    borderRadius: ui.radiusInput,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    backgroundColor: ui.background,
    marginBottom: ui.spaceSm,
  },
  optCardOn: {
    borderWidth: 2,
    borderColor: ui.primary,
    backgroundColor: ui.surfaceTintPrimary,
  },
  optTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: ui.textPrimary,
    marginBottom: 4,
  },
  optTitleOn: {
    color: ui.primary,
  },
  optLine: {
    fontSize: 15,
    color: ui.textSecondary,
    lineHeight: 22,
  },
});
