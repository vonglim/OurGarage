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
  /**
   * `protection` — wizard / listing editor copy.
   * `terms` — listing detail policy-oriented copy.
   */
  variant?: 'protection' | 'terms';
};

export function ProtectionSummaryCard({
  replacementValue,
  dailyLateFee,
  maxLateFeeCap,
  preauthAmount,
  compact = false,
  variant = 'protection',
}: Props) {
  const hold = typeof preauthAmount === 'number' ? preauthAmount : calculatePreauthAmount(replacementValue);

  if (variant === 'terms') {
    return (
      <View style={[styles.cardTerms, compact && styles.cardTermsCompact]}>
        <Text style={styles.titleTerms}>Terms & conditions</Text>
        <View style={styles.termsDivider} />
        <View style={styles.termsSection}>
          <View style={styles.termsRow}>
            <Text style={styles.termsLabel}>Replacement value</Text>
            <Text style={styles.termsValue}>{formatUsd(replacementValue)}</Text>
          </View>
        </View>
        <View style={styles.termsDivider} />
        <View style={styles.termsSection}>
          <View style={styles.termsRowStack}>
            <Text style={styles.termsLabel}>Late return fee</Text>
            <Text style={styles.termsValueSoft}>
              {`20% of the daily rental rate per overdue day${dailyLateFee > 0 ? ` (${formatUsd(dailyLateFee)} / day)` : ''}.`}
            </Text>
          </View>
        </View>
        <View style={styles.termsDivider} />
        <View style={styles.termsSection}>
          <View style={styles.termsRowStack}>
            <Text style={styles.termsLabel}>Maximum late fee</Text>
            <Text style={styles.termsValueSoft}>
              Capped at the item replacement value ({formatUsd(maxLateFeeCap)}).
            </Text>
          </View>
        </View>
        <View style={styles.termsDivider} />
        <View style={styles.termsSection}>
          <View style={styles.termsRowStack}>
            <Text style={styles.termsLabel}>Preauthorization hold</Text>
            <Text style={styles.termsPolicyBody}>
              A temporary authorization hold of up to {formatUsd(hold)} may be placed to help cover potential damage,
              late returns, fees, or missing items. This is not an immediate charge.
            </Text>
          </View>
        </View>
      </View>
    );
  }

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
  cardTerms: {
    borderRadius: ui.radiusInput,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    backgroundColor: ui.background,
    overflow: 'hidden',
    paddingVertical: 4,
  },
  cardTermsCompact: {
    paddingVertical: 2,
  },
  titleTerms: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.textSecondary,
    letterSpacing: 0.55,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  termsDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: ui.border,
    marginHorizontal: 0,
  },
  termsSection: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  termsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 14,
  },
  termsRowStack: {
    gap: 6,
  },
  termsLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: ui.textPrimary,
    letterSpacing: -0.15,
    flex: 1,
    flexShrink: 1,
  },
  termsValue: {
    fontSize: 15,
    fontWeight: '600',
    color: ui.textPrimary,
    letterSpacing: -0.2,
    flexShrink: 0,
  },
  termsValueSoft: {
    fontSize: 14,
    fontWeight: '400',
    color: ui.textSecondary,
    lineHeight: 21,
  },
  termsPolicyBody: {
    fontSize: 14,
    fontWeight: '400',
    color: ui.textSecondary,
    lineHeight: 21,
  },
});
