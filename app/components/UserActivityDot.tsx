import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { activityDotColor, getUserActivityStatus } from '../lib/userActivityStatus';

const DOT = 7;

type Props = {
  lastActive: number | null | undefined;
  style?: ViewStyle | ViewStyle[];
};

export function UserActivityDot({ lastActive, style }: Props) {
  const status = getUserActivityStatus(lastActive);
  return (
    <View
      style={[styles.dot, { backgroundColor: activityDotColor(status) }, style]}
      accessibilityLabel={status === 'active' ? 'Active recently' : 'Not active recently'}
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    marginRight: 6,
    flexShrink: 0,
  },
});
