import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';

export type RentalEvidenceVideoThumbProps = {
  size?: 'handoffSquare' | 'handoffItem' | 'handoffWideHero';
  onPress: () => void;
  onDelete?: () => void;
  label?: string;
};

const SIZE = {
  handoffSquare: 96,
  handoffItem: 88,
  handoffWideHero: 228,
} as const;

export function RentalEvidenceVideoThumb({
  size = 'handoffSquare',
  onPress,
  onDelete,
  label = 'Optional video',
}: RentalEvidenceVideoThumbProps) {
  const edge = SIZE[size];
  const height = size === 'handoffWideHero' ? 118 : edge;

  return (
    <View style={styles.outer}>
      <Pressable
        pressOpacityFeedback={false}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}, play video`}
      >
        <View style={[styles.wrap, { width: edge, height }]}>
          <Ionicons name="videocam" size={28} color="#E2E8F0" />
          <View style={styles.playBadge}>
            <Ionicons name="play" size={16} color="#FFFFFF" />
          </View>
          <Text style={styles.caption} numberOfLines={1}>
            {label}
          </Text>
        </View>
      </Pressable>
      {onDelete ? (
        <Pressable
          pressOpacityFeedback={false}
          onPress={onDelete}
          style={styles.deleteBtn}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
        >
          <Ionicons name="close" size={14} color="#FFFFFF" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { position: 'relative' },
  deleteBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  wrap: {
    borderRadius: 12,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
  },
  playBadge: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  caption: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 6,
    fontSize: 10,
    fontWeight: '700',
    color: '#F8FAFC',
    textAlign: 'center',
  },
});
