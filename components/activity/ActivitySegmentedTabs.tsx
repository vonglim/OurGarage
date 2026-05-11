import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { shadowSegmentActive, ui } from '@/constants/appUi';

export type ActivitySegmentTab<T extends string> = {
  key: T;
  label: string;
  badgeCount?: number;
  accessibilityLabel: string;
};

type Props<T extends string> = {
  tabs: readonly ActivitySegmentTab<T>[];
  value: T;
  onChange: (key: T) => void;
};

function formatBadge(n: number): string {
  return n > 99 ? '99+' : String(Math.max(0, n));
}

export function ActivitySegmentedTabs<T extends string>({ tabs, value, onChange }: Props<T>) {
  return (
    <View style={styles.row}>
      {tabs.map((t) => {
        const selected = t.key === value;
        const badge = t.badgeCount != null && t.badgeCount > 0 ? formatBadge(t.badgeCount) : null;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            style={({ pressed }) => [
              styles.cell,
              selected ? styles.cellActive : styles.cellInactive,
              pressed && styles.pressed,
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={t.accessibilityLabel}
          >
            <Text style={[styles.label, selected && styles.labelActive]} numberOfLines={1}>
              {t.label}
            </Text>
            {badge != null ? (
              <View style={selected ? styles.badgeOn : styles.badgeMuted}>
                <Text style={selected ? styles.badgeOnText : styles.badgeMutedText}>{badge}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginBottom: 12,
  },
  cell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    minHeight: 44,
  },
  cellInactive: {
    backgroundColor: ui.surfaceNeutral,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  cellActive: {
    backgroundColor: ui.surfaceTintPrimary,
    borderWidth: 2,
    borderColor: ui.primary,
    ...shadowSegmentActive,
  },
  pressed: {
    opacity: 0.92,
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
    color: ui.textSecondary,
    letterSpacing: -0.1,
  },
  labelActive: {
    color: ui.primary,
  },
  badgeOn: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: ui.primary,
    alignItems: 'center',
  },
  badgeOnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
  badgeMuted: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: ui.surfaceGrouped,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    alignItems: 'center',
  },
  badgeMutedText: {
    fontSize: 11,
    fontWeight: '800',
    color: ui.textSecondary,
  },
});
