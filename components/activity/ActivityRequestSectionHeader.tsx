import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';

type Props = {
  iconName: React.ComponentProps<typeof Ionicons>['name'];
  iconBg: string;
  iconColor: string;
  title: string;
  count: number;
  description: string;
  expanded: boolean;
  onToggleExpand: () => void;
  /** Tint for count pill — warm (urgent), cool (searching), green (in progress), neutral. */
  countTone?: 'navy' | 'danger' | 'sky' | 'success';
};

export function ActivityRequestSectionHeader({
  iconName,
  iconBg,
  iconColor,
  title,
  count,
  description,
  expanded,
  onToggleExpand,
  countTone = 'navy',
}: Props) {
  const badge = count > 99 ? '99+' : String(Math.max(0, count));
  const countBadgeStyle =
    countTone === 'danger'
      ? styles.countBadgeDanger
      : countTone === 'sky'
        ? styles.countBadgeSky
        : countTone === 'success'
          ? styles.countBadgeSuccess
          : styles.countBadgeNavy;
  const countBadgeTextStyle =
    countTone === 'danger'
      ? styles.countBadgeTextDanger
      : countTone === 'sky'
        ? styles.countBadgeTextSky
        : countTone === 'success'
          ? styles.countBadgeTextSuccess
          : styles.countBadgeTextNavy;
  return (
    <Pressable
      onPress={onToggleExpand}
      pressOpacityFeedback={false}
      style={({ pressed }) => [styles.pressRow, pressed && { opacity: 0.88 }]}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={`${title}, ${count} items. ${expanded ? 'Collapse' : 'Expand'}`}
    >
      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={iconName} size={16} color={iconColor} />
      </View>
      <View style={styles.textCol}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{title}</Text>
          {count > 0 ? (
            <View style={countBadgeStyle}>
              <Text style={countBadgeTextStyle}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.description}>{description}</Text>
      </View>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={ui.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
    marginTop: 2,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  title: {
    fontSize: 12,
    fontWeight: '800',
    color: ui.textSecondary,
    letterSpacing: 0.55,
    textTransform: 'uppercase',
  },
  countBadgeNavy: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    backgroundColor: ui.surfaceGrouped,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeDanger: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    backgroundColor: 'rgba(254, 242, 242, 0.95)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(220, 38, 38, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeSky: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    backgroundColor: 'rgba(239, 246, 255, 0.95)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(37, 99, 235, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeSuccess: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    backgroundColor: 'rgba(236, 253, 245, 0.95)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(22, 163, 74, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeTextNavy: {
    fontSize: 11,
    fontWeight: '800',
    color: ui.textPrimary,
  },
  countBadgeTextDanger: {
    fontSize: 11,
    fontWeight: '800',
    color: '#9B1C1C',
  },
  countBadgeTextSky: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  countBadgeTextSuccess: {
    fontSize: 11,
    fontWeight: '800',
    color: '#166534',
  },
  description: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    color: 'rgba(71, 85, 105, 0.92)',
    fontWeight: '500',
  },
});
