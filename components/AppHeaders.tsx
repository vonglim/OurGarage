import Ionicons from '@expo/vector-icons/Ionicons';
import React, { type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';

type RootScreenHeaderProps = {
  title: string;
  rightAccessory?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function RootScreenHeader({ title, rightAccessory, style }: RootScreenHeaderProps) {
  return (
    <View style={[styles.rootWrap, style]}>
      <Text style={styles.rootTitle} numberOfLines={1}>
        {title}
      </Text>
      {rightAccessory ? <View style={styles.rightSlot}>{rightAccessory}</View> : null}
    </View>
  );
}

type BackHeaderProps = {
  title: string;
  onBack: () => void;
  subtitle?: string;
  rightAccessory?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function BackHeader({ title, onBack, subtitle, rightAccessory, style }: BackHeaderProps) {
  return (
    <View style={[styles.inlineWrap, style]}>
      <View style={styles.inlineRow}>
        <Pressable
          pressOpacityFeedback={false}
          haptic
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={onBack}
          style={({ pressed }) => [styles.backHit, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="chevron-back" size={22} color={ui.textPrimary} />
        </Pressable>
        <Text style={styles.inlineTitle} numberOfLines={1}>
          {title}
        </Text>
        {rightAccessory ? <View style={styles.rightSlot}>{rightAccessory}</View> : <View style={styles.rightPad} />}
      </View>
      {subtitle ? <Text style={styles.inlineSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rootWrap: {
    minHeight: ui.headerInlineHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  rootTitle: {
    flex: 1,
    fontSize: ui.headerRootTitle,
    lineHeight: 34,
    fontWeight: '800',
    color: ui.textPrimary,
  },
  inlineWrap: {
    marginBottom: 14,
  },
  inlineRow: {
    minHeight: ui.headerInlineHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backHit: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    marginLeft: -4,
  },
  inlineTitle: {
    flex: 1,
    fontSize: ui.headerInlineTitle,
    lineHeight: 28,
    fontWeight: '700',
    color: ui.textPrimary,
  },
  inlineSubtitle: {
    marginLeft: 40,
    marginTop: 2,
    fontSize: 13,
    color: ui.textSecondary,
    fontWeight: '500',
  },
  rightSlot: {
    marginLeft: 8,
  },
  rightPad: {
    width: 36,
    height: 36,
  },
});
