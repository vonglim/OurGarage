import Ionicons from '@expo/vector-icons/Ionicons';
import React, { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ui } from '@/constants/appUi';

import { transactionNav } from './transactionTokens';

export type TransactionHeaderProps = {
  onBack: () => void;
  /** e.g. offer count pill */
  rightAccessory?: ReactNode;
  title: string;
  /** Muted line under the title (e.g. request context split from `toolName`). */
  titleContext?: string;
  subtitle?: string;
  /** Extra top inset (safe area) applied inside the header block */
  topInset: number;
  /** Tighter vertical rhythm (`compact`) or compare hero (`compare`). */
  density?: 'default' | 'compact' | 'compare';
};

export function TransactionHeader({
  onBack,
  rightAccessory,
  title,
  titleContext,
  subtitle,
  topInset,
  density = 'default',
}: TransactionHeaderProps) {
  const compact = density === 'compact' || density === 'compare';
  const compare = density === 'compare';
  const hasContext = Boolean(titleContext?.trim());
  return (
    <View style={[styles.root, compact && styles.rootCompact, { paddingTop: topInset }]}>
      <View
        style={[
          styles.utilityRow,
          compact && styles.utilityRowCompact,
          compare && styles.utilityRowCompare,
        ]}
      >
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          haptic
          pressOpacityFeedback={false}
          style={({ pressed }) => [
            styles.backCircle,
            compare && styles.backCircleEdgeNudge,
            pressed && styles.backCirclePressed,
          ]}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
        >
          <Ionicons name="chevron-back" size={22} color={transactionNav.backIcon} />
        </Pressable>
        <View style={styles.rightSlot}>{rightAccessory}</View>
      </View>
      <Text
        style={[
          styles.title,
          compare && styles.titleCompare,
          !compare && hasContext && styles.titleHero,
          compact && !hasContext && !compare && styles.titleCompact,
        ]}
        numberOfLines={compare ? 2 : hasContext ? 2 : 3}
      >
        {title}
      </Text>
      {titleContext?.trim() ? (
        <Text style={styles.titleContext} numberOfLines={3}>
          {titleContext.trim()}
        </Text>
      ) : null}
      {subtitle ? (
        <Text
          style={[
            styles.subtitle,
            compare && styles.subtitleCompare,
            !compare && hasContext && styles.subtitleThread,
            compact && !hasContext && !compare && styles.subtitleCompact,
          ]}
          numberOfLines={hasContext ? 3 : 2}
        >
          {subtitle}
        </Text>
      ) : null}
      <View style={styles.divider} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: ui.padScreenH,
    paddingBottom: 2,
    backgroundColor: ui.surfaceGrouped,
  },
  rootCompact: {
    paddingBottom: 0,
  },
  utilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    minHeight: 40,
  },
  utilityRowCompact: {
    marginBottom: 4,
    minHeight: 36,
  },
  utilityRowCompare: {
    marginBottom: 2,
    minHeight: 32,
  },
  backCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: transactionNav.backFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backCirclePressed: {
    opacity: 0.88,
    backgroundColor: ui.surfaceNeutral,
  },
  /** Compare: pull control toward native left edge without changing hit target size. */
  backCircleEdgeNudge: {
    marginLeft: -10,
  },
  rightSlot: {
    flexShrink: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  title: {
    fontSize: 25,
    fontWeight: '800',
    letterSpacing: -0.35,
    color: ui.primary,
    lineHeight: 30,
    marginBottom: 3,
  },
  /** Offer thread: calmer, larger item title when context is split out below. */
  titleHero: {
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.42,
    color: ui.textPrimary,
    marginBottom: 4,
  },
  titleContext: {
    fontSize: 13,
    fontWeight: '500',
    color: ui.textSecondary,
    lineHeight: 19,
    marginBottom: 8,
  },
  titleCompact: {
    marginBottom: 2,
    lineHeight: 28,
  },
  /** Compare hero — reduced dominance vs offer cards (~6% smaller title, tighter rhythm). */
  titleCompare: {
    fontSize: 22,
    lineHeight: 26,
    marginBottom: 0,
    letterSpacing: -0.36,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: ui.textSecondary,
    lineHeight: 20,
    marginBottom: 10,
  },
  subtitleThread: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: ui.textSecondary,
    opacity: 0.92,
    marginBottom: 8,
    marginTop: 0,
  },
  subtitleCompact: {
    marginBottom: 6,
    lineHeight: 19,
  },
  subtitleCompare: {
    marginBottom: 1,
    lineHeight: 16,
    fontSize: 11,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: ui.border,
    marginHorizontal: -ui.padScreenH,
  },
});
