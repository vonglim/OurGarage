import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';

export type MetadataRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  showChevron?: boolean;
  accessibilityLabel?: string;
};

export function MetadataRow({
  icon,
  title,
  subtitle,
  onPress,
  showChevron,
  accessibilityLabel,
}: MetadataRowProps) {
  const row = (
    <View style={styles.row}>
      <View style={styles.iconWell}>
        <Ionicons name={icon} size={20} color={ui.primary} />
      </View>
      <View style={styles.textCol}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={3}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {showChevron ? (
        <Ionicons name="chevron-down" size={18} color={ui.textSecondary} style={styles.chev} />
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? `${title}. ${subtitle ?? ''}`}
        pressOpacityFeedback
        style={({ pressed }) => [pressed && styles.rowPressed]}
      >
        {row}
      </Pressable>
    );
  }

  return (
    <View accessibilityLabel={accessibilityLabel ?? `${title}. ${subtitle ?? ''}`}>{row}</View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  rowPressed: {
    opacity: 0.9,
  },
  iconWell: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: ui.surfaceTintPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: ui.primary,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '500',
    color: ui.textSecondary,
    lineHeight: 20,
  },
  chev: {
    marginLeft: 4,
  },
});
