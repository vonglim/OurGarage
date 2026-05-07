import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ui } from '@/constants/appUi';
import { formatUsd } from '@/lib/money';
import { calculatePreauthAmount } from '@/lib/rentalProtection';

type Props = {
  replacementValue: number;
  dailyLateFee: number;
  maxLateFeeCap: number;
  preauthAmount?: number | null;
  compact?: boolean;
};

export function ProtectionSummaryCard({
  replacementValue,
  dailyLateFee,
  maxLateFeeCap,
  preauthAmount,
  compact = false,
}: Props) {
  const hold = typeof preauthAmount === 'number' ? preauthAmount : calculatePreauthAmount(replacementValue);
  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <Text style={styles.title}>Protection Summary</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Replacement value</Text>
        <Text style={styles.value}>{formatUsd(replacementValue)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Daily late fee</Text>
        <Text style={styles.value}>{`${formatUsd(dailyLateFee)} / day`}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Max late fee cap</Text>
        <Text style={styles.value}>{formatUsd(maxLateFeeCap)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Estimated preauth hold</Text>
        <Text style={styles.value}>{formatUsd(hold)}</Text>
      </View>
      <Text style={styles.note}>This is a temporary authorization hold preview, not an immediate charge.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ui.border,
    backgroundColor: '#F8FAFD',
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 6,
  },
  cardCompact: {
    paddingVertical: 8,
  },
  title: {
    fontSize: 12,
    fontWeight: '800',
    color: ui.textPrimary,
    marginBottom: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    flex: 1,
    fontSize: 11,
    color: ui.textMuted,
    fontWeight: '600',
  },
  value: {
    fontSize: 11,
    color: ui.textPrimary,
    fontWeight: '700',
  },
  note: {
    fontSize: 10,
    color: ui.textMuted,
    marginTop: 2,
  },
});
