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
  /** Count pill color — red (urgent), blue (searching), green (in progress), navy default. */
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
    countTone === 'danger' || countTone === 'sky' || countTone === 'success'
      ? styles.countBadgeTextOnLight
      : styles.countBadgeText;
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
        <Ionicons name={iconName} size={18} color={iconColor} />
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
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={22} color={ui.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
    marginTop: 4,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
    fontSize: 13,
    fontWeight: '800',
    color: ui.primary,
    letterSpacing: 0.6,
  },
  countBadgeNavy: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    backgroundColor: ui.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeDanger: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeSky: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeSuccess: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
  countBadgeTextOnLight: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
  description: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: ui.textSecondary,
    fontWeight: '500',
  },
});
