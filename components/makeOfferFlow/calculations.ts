import { formatUsd } from '@/lib/money';

import type { WizardDraft } from './types';

export type RatePreviewModel = {
  durationDays: number;
  durationLabel: string;
  dateRangeLabel: string;
  deliveryLine: string;
  deliveryFeeAmount: number;
  includedSummary: string;
  includedCount: number;
  renterTotal: number;
  estimatedEarnings: number;
  platformFeeRate: number;
};

function parseMoney(s: string): number {
  const n = Number(String(s).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function resolveDeliveryFee(draft: WizardDraft): number {
  if (draft.deliveryMode !== 'delivery') return 0;
  if (draft.feePreset === 'free') return 0;
  if (draft.feePreset === 10) return 10;
  if (draft.feePreset === 25) return 25;
  return parseMoney(draft.feeCustom);
}

export function resolveMilesLabel(draft: WizardDraft): string {
  if (draft.deliveryMode !== 'delivery') return '';
  if (draft.milesPreset === 'custom') {
    const c = draft.milesCustom.trim();
    return c ? `${c} mi` : 'Custom range';
  }
  return `${draft.milesPreset} mi`;
}

/** Local-only preview math — not authoritative billing. */
export function buildRatePreview(
  draft: WizardDraft,
  durationDays: number,
  dateRangeLabel: string
): RatePreviewModel | null {
  const daily = parseMoney(draft.dailyRate);
  if (daily <= 0) return null;

  const deliveryFee = resolveDeliveryFee(draft);
  const subtotal = daily * Math.max(1, durationDays);
  const renterTotal = subtotal + deliveryFee;
  const platformFeeRate = 0.1;
  const estimatedEarnings = Math.max(0, renterTotal * (1 - platformFeeRate));

  let deliveryLine = 'Pickup';
  if (draft.deliveryMode === 'delivery') {
    const miles = resolveMilesLabel(draft);
    const fee =
      deliveryFee <= 0 ? 'Free delivery' : `${formatUsd(deliveryFee)} delivery fee`;
    deliveryLine = miles ? `I’ll handle delivery • Within ${miles} • ${fee}` : `Delivery • ${fee}`;
  }

  const acc = draft.accessories.filter(Boolean);
  const includedSummary = acc.length ? acc.join(', ') : '—';
  const includedCount = acc.length;

  return {
    durationDays: Math.max(1, durationDays),
    durationLabel: `${Math.max(1, durationDays)} day${Math.max(1, durationDays) === 1 ? '' : 's'}`,
    dateRangeLabel,
    deliveryLine,
    deliveryFeeAmount: deliveryFee,
    includedSummary,
    includedCount,
    renterTotal,
    estimatedEarnings,
    platformFeeRate,
  };
}

export function formatHoldRange(marketValue: number): { low: number; high: number } {
  const low = Math.round(marketValue * 1.2);
  const high = Math.round(marketValue * 1.4);
  return { low, high };
}
