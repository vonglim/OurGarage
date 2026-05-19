import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ui } from '@/constants/appUi';
import {
  buildRentalPricingBreakdownRows,
  getEstimatedTotalLabel,
  type ListingRentalPricingResult,
  type RentalPricingBreakdownRow,
} from '@/lib/rentalPricing';
import { formatUsd } from '@/lib/money';

export type RentalPricingBreakdownProps = {
  /** Full canonical pricing result — preferred input. */
  pricing?: Pick<
    ListingRentalPricingResult,
    | 'subtotal'
    | 'deliveryFee'
    | 'serviceFee'
    | 'taxes'
    | 'protectionFee'
    | 'promotionalDiscount'
    | 'creditsApplied'
    | 'estimatedTotal'
    | 'selectedMethod'
    | 'taxesIncludedInEstimate'
    | 'pricingBreakdownRows'
  >;
  /** Override rows (merged after built-in rows except total). */
  extraRows?: RentalPricingBreakdownRow[];
  /** Section heading — default "Pricing summary". */
  title?: string;
  /** When pricing is omitted, pass rows directly. */
  rows?: RentalPricingBreakdownRow[];
};

function formatRowAmount(amount: number): string {
  if (amount < 0) return `−${formatUsd(Math.abs(amount))}`;
  return formatUsd(amount);
}

export function RentalPricingBreakdown({
  pricing,
  extraRows,
  title = 'Pricing summary',
  rows: rowsOverride,
}: RentalPricingBreakdownProps) {
  const rows = useMemo(() => {
    if (rowsOverride?.length) return rowsOverride;
    if (!pricing) return [];
    const built =
      pricing.pricingBreakdownRows?.length > 0
        ? pricing.pricingBreakdownRows
        : buildRentalPricingBreakdownRows(pricing);
    if (!extraRows?.length) return built;
    const totalRow = built.find((r) => r.emphasis === 'total');
    const middle = built.filter((r) => r.emphasis !== 'total');
    return [...middle, ...extraRows, ...(totalRow ? [totalRow] : [])];
  }, [extraRows, pricing, rowsOverride]);

  if (rows.length === 0) return null;

  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <Text style={styles.title}>{title}</Text>
      <View style={styles.card}>
        {rows.map((row, index) => {
          const isTotal = row.emphasis === 'total';
          const isLast = index === rows.length - 1;
          return (
            <View
              key={row.key}
              style={[styles.row, !isLast && styles.rowBorder, isTotal && styles.rowTotal]}
            >
              <Text style={[styles.label, isTotal && styles.labelTotal]} numberOfLines={2}>
                {row.label}
              </Text>
              <Text style={[styles.amount, isTotal && styles.amountTotal]}>
                {row.amount > 0 || row.amount < 0 ? formatRowAmount(row.amount) : '—'}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Re-export for screens that only need the total label string. */
export { getEstimatedTotalLabel };

const styles = StyleSheet.create({
  wrap: {
    marginTop: 4,
    marginBottom: 10,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: ui.textSecondary,
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.border,
    backgroundColor: ui.background,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 12,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.border,
  },
  rowTotal: {
    backgroundColor: ui.surfaceGrouped,
  },
  label: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: ui.textPrimary,
  },
  labelTotal: {
    fontSize: 15,
    fontWeight: '800',
    color: ui.textPrimary,
  },
  amount: {
    fontSize: 15,
    fontWeight: '600',
    color: ui.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  amountTotal: {
    fontSize: 17,
    fontWeight: '800',
    color: ui.primary,
  },
});
