import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ui } from '@/constants/appUi';

export type OfferDecisionStatusStripProps = {
  /** e.g. "1 OFFER RECEIVED" or "YOUR OFFER" */
  headline: string;
  /** Second line, e.g. "Your request: $250/day • Full Day • Pickup" */
  requestLine: string;
  density?: 'default' | 'compact' | 'compare';
};

/**
 * Compact transactional status — no tutorial copy (decision screen only).
 */
export function OfferDecisionStatusStrip({
  headline,
  requestLine,
  density = 'default',
}: OfferDecisionStatusStripProps) {
  const compact = density === 'compact' || density === 'compare';
  const compare = density === 'compare';
  return (
    <View
      style={[styles.row, compact && styles.rowCompact, compare && styles.rowCompare]}
      accessibilityRole="summary"
    >
      <View
        style={[styles.iconBox, compact && styles.iconBoxCompact, compare && styles.iconBoxCompare]}
      >
        <Ionicons name="notifications-outline" size={compare ? 16 : 18} color={ui.primary} />
      </View>
      <View style={styles.textCol}>
        <Text style={[styles.headline, compare && styles.headlineCompare]}>{headline}</Text>
        <Text style={[styles.requestLine, compare && styles.requestLineCompare]}>{requestLine}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  rowCompact: {
    marginBottom: 8,
  },
  rowCompare: {
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 0,
    gap: 5,
    alignSelf: 'stretch',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: ui.borderLight,
    paddingVertical: 1,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: ui.surfaceTintPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxCompact: {
    width: 36,
    height: 36,
    borderRadius: 9,
  },
  iconBoxCompare: {
    width: 30,
    height: 30,
    borderRadius: 8,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  headline: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: ui.primary,
    marginBottom: 4,
  },
  headlineCompare: {
    fontSize: 10,
    lineHeight: 12,
    marginBottom: 0,
    letterSpacing: 0.55,
    fontWeight: '700',
  },
  requestLine: {
    fontSize: 15,
    fontWeight: '600',
    color: ui.textSecondary,
    lineHeight: 21,
  },
  requestLineCompare: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 0,
  },
});
