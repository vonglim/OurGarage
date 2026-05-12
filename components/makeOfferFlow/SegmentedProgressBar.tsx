import React, { useEffect, useRef } from 'react';
import { Animated, LayoutAnimation, Platform, StyleSheet, UIManager, View } from 'react-native';

import { MAO_PROGRESS_GREEN, MAO_PROGRESS_TRACK } from './constants';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = {
  filledSegments: number;
  totalSegments?: number;
};

export function SegmentedProgressBar({ filledSegments, totalSegments = 7 }: Props) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, 'opacity'));
    Animated.sequence([
      Animated.timing(opacity, { toValue: 0.82, duration: 90, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
    ]).start();
  }, [filledSegments, opacity]);

  const safeFilled = Math.max(0, Math.min(totalSegments, filledSegments));

  return (
    <Animated.View style={[styles.row, { opacity }]}>
      {Array.from({ length: totalSegments }, (_, i) => (
        <View
          key={i}
          style={[styles.segment, i < safeFilled ? styles.segmentOn : styles.segmentOff]}
        />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  segmentOn: {
    backgroundColor: MAO_PROGRESS_GREEN,
  },
  segmentOff: {
    backgroundColor: MAO_PROGRESS_TRACK,
  },
});
